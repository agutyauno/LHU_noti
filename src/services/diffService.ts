import { prisma } from './prismaService';
import { fetchStudentSchedule, LHUScheduleItem } from './lhuService';
import { formatUrgentDiffAlertMessage } from './notificationService';
import { messageQueue } from './queueService';
import { getTodayString, getTomorrowString, formatTimeString } from '../utils/dateUtils';
import { logger, diffLogger } from '../utils/logger';

export interface ScheduleDiffChange {
  type: 'ROOM_CHANGED' | 'TIME_CHANGED' | 'TEACHER_CHANGED' | 'CANCELED' | 'NEW_CLASS';
  subjectName: string;
  groupName: string;
  description: string;
}

function formatLocation(room?: string, campus?: string): string {
  const r = room || 'Chưa xếp phòng';
  return campus ? `${r} (${campus})` : r;
}

/**
 * Compares old schedule snapshot with newly fetched schedule array
 */
export function computeScheduleDiff(
  oldSchedule: LHUScheduleItem[],
  newSchedule: LHUScheduleItem[]
): ScheduleDiffChange[] {
  const changes: ScheduleDiffChange[] = [];

  const oldMap = new Map<string, LHUScheduleItem>();
  oldSchedule.forEach((item) => {
    // Unique key per class session: ID or NhomID+ThoiGianBD
    const key = item.ID ? String(item.ID) : `${item.NhomID}_${item.ThoiGianBD}`;
    oldMap.set(key, item);
  });

  const newMap = new Map<string, LHUScheduleItem>();
  newSchedule.forEach((item) => {
    const key = item.ID ? String(item.ID) : `${item.NhomID}_${item.ThoiGianBD}`;
    newMap.set(key, item);
  });

  // Check for modifications or new classes
  newSchedule.forEach((newItem) => {
    const key = newItem.ID ? String(newItem.ID) : `${newItem.NhomID}_${newItem.ThoiGianBD}`;
    const oldItem = oldMap.get(key);

    const newStart = formatTimeString(newItem.ThoiGianBD);
    const newEnd = formatTimeString(newItem.ThoiGianKT);
    const newLoc = formatLocation(newItem.TenPhong, newItem.TenCoSo);

    if (!oldItem) {
      changes.push({
        type: 'NEW_CLASS',
        subjectName: newItem.TenMonHoc,
        groupName: newItem.TenNhom || '',
        description: `Bổ sung buổi học mới (${newStart} - ${newEnd}) tại ${newLoc}, GV: ${newItem.GiaoVien || 'N/A'}.`,
      });
    } else {
      const oldStart = formatTimeString(oldItem.ThoiGianBD);
      const oldEnd = formatTimeString(oldItem.ThoiGianKT);
      const oldLoc = formatLocation(oldItem.TenPhong, oldItem.TenCoSo);

      // Room Change
      if (oldItem.TenPhong !== newItem.TenPhong || oldItem.TenCoSo !== newItem.TenCoSo) {
        changes.push({
          type: 'ROOM_CHANGED',
          subjectName: newItem.TenMonHoc,
          groupName: newItem.TenNhom || '',
          description: `Đổi địa điểm học buổi (${newStart} - ${newEnd}) từ "${oldLoc}" sang "${newLoc}".`,
        });
      }
      // Time Change
      if (oldItem.ThoiGianBD !== newItem.ThoiGianBD || oldItem.ThoiGianKT !== newItem.ThoiGianKT) {
        changes.push({
          type: 'TIME_CHANGED',
          subjectName: newItem.TenMonHoc,
          groupName: newItem.TenNhom || '',
          description: `Thay đổi giờ học tại ${newLoc} từ (${oldStart} - ${oldEnd}) sang (${newStart} - ${newEnd}).`,
        });
      }
      // Teacher Change
      if (oldItem.GiaoVien !== newItem.GiaoVien) {
        changes.push({
          type: 'TEACHER_CHANGED',
          subjectName: newItem.TenMonHoc,
          groupName: newItem.TenNhom || '',
          description: `Đổi giảng viên buổi (${newStart} - ${newEnd}) tại ${newLoc} từ "${oldItem.GiaoVien || 'N/A'}" sang "${newItem.GiaoVien || 'N/A'}".`,
        });
      }
    }
  });

  // Check for canceled classes (existed in old snapshot but absent in new)
  oldSchedule.forEach((oldItem) => {
    const key = oldItem.ID ? String(oldItem.ID) : `${oldItem.NhomID}_${oldItem.ThoiGianBD}`;
    if (!newMap.has(key)) {
      const oldStart = formatTimeString(oldItem.ThoiGianBD);
      const oldEnd = formatTimeString(oldItem.ThoiGianKT);
      const oldLoc = formatLocation(oldItem.TenPhong, oldItem.TenCoSo);
      changes.push({
        type: 'CANCELED',
        subjectName: oldItem.TenMonHoc,
        groupName: oldItem.TenNhom || '',
        description: `Hủy buổi học (${oldStart} - ${oldEnd}) môn ${oldItem.TenMonHoc} (dự kiến học tại ${oldLoc}).`,
      });
    }
  });

  return changes;
}

/**
 * Scan schedule changes for a single student on a target date
 */
export async function checkStudentDiffForDate(
  zaloUserId: string,
  studentId: string,
  zaloName: string | null,
  dateStr: string,
  newScheduleInput?: LHUScheduleItem[],
  studentNameInput?: string
): Promise<void> {
  let newSchedule: LHUScheduleItem[] = [];
  let studentName = studentNameInput || zaloName || studentId;

  if (newScheduleInput !== undefined) {
    newSchedule = newScheduleInput;
  } else {
    const fetchResult = await fetchStudentSchedule(studentId, dateStr);
    if (!fetchResult.success) {
      logger.warn(`API_DEGRADED: Skipping diff engine for ${studentId} on ${dateStr} due to API error: ${fetchResult.error}`);
      return;
    }
    newSchedule = fetchResult.scheduleList;
    if (fetchResult.studentName) studentName = fetchResult.studentName;
  }

  // Retrieve existing snapshot from DB
  const existingSnapshot = await prisma.scheduleSnapshot.findFirst({
    where: {
      studentId: zaloUserId,
      date: dateStr,
    },
  });

  let oldSchedule: LHUScheduleItem[] = [];
  if (existingSnapshot && existingSnapshot.scheduleData) {
    try {
      oldSchedule = JSON.parse(existingSnapshot.scheduleData);
    } catch {
      oldSchedule = [];
    }
  }

  // If snapshot exists, calculate diff
  if (existingSnapshot) {
    const changes = computeScheduleDiff(oldSchedule, newSchedule);

    if (changes.length > 0) {
      diffLogger.info(`Schedule changes detected for ${studentId} (${zaloUserId}) on ${dateStr}: ${JSON.stringify(changes)}`);

      const todayStr = getTodayString();
      const tomorrowStr = getTomorrowString();

      // High Priority Alert for Today or Tomorrow
      if (dateStr === todayStr || dateStr === tomorrowStr) {
        const alertMsg = formatUrgentDiffAlertMessage(studentName, dateStr, changes);
        messageQueue.enqueue(zaloUserId, alertMsg);
      }
    }
  }

  // Save or update snapshot in SQLite DB
  const jsonContent = JSON.stringify(newSchedule);
  if (existingSnapshot) {
    await prisma.scheduleSnapshot.update({
      where: { id: existingSnapshot.id },
      data: { scheduleData: jsonContent },
    });
  } else {
    await prisma.scheduleSnapshot.create({
      data: {
        studentId: zaloUserId,
        date: dateStr,
        scheduleData: jsonContent,
      },
    });
  }
}

/**
 * Scan all active students for schedule changes across today and tomorrow
 */
export async function runDiffScannerAllActiveStudents(): Promise<void> {
  try {
    const activeStudents = await prisma.student.findMany({
      where: { isActive: true },
    });

    if (activeStudents.length === 0) {
      logger.info('Diff Scanner: No active students registered.');
      return;
    }

    logger.info(`Diff Scanner: Scanning schedule diff for ${activeStudents.length} active student(s)...`);
    const todayStr = getTodayString();
    const tomorrowStr = getTomorrowString();

    for (const student of activeStudents) {
      // Fetch ONCE starting from todayStr (unfiltered) containing today and future days
      const fetchResult = await fetchStudentSchedule(student.studentId, todayStr, 100, false);
      if (!fetchResult.success) {
        logger.warn(`API_DEGRADED: Skipping diff engine for ${student.studentId} due to API error: ${fetchResult.error}`);
        continue;
      }

      const rawSchedule = fetchResult.scheduleList || [];
      const studentName = fetchResult.studentName || student.zaloName || student.studentId;

      // Extract today and tomorrow schedules in memory
      const todaySchedule = rawSchedule.filter((item) => item?.ThoiGianBD && item.ThoiGianBD.startsWith(todayStr));
      const tomorrowSchedule = rawSchedule.filter((item) => item?.ThoiGianBD && item.ThoiGianBD.startsWith(tomorrowStr));

      await checkStudentDiffForDate(student.zaloUserId, student.studentId, studentName, todayStr, todaySchedule, studentName);
      await checkStudentDiffForDate(student.zaloUserId, student.studentId, studentName, tomorrowStr, tomorrowSchedule, studentName);
    }

    logger.info('Diff Scanner cycle completed successfully.');
  } catch (error: any) {
    logger.error(`Error in runDiffScannerAllActiveStudents: ${error.message}`);
  }
}
