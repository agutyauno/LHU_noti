import { prisma } from './prismaService';
import { fetchStudentSchedule, LHUScheduleItem } from './lhuService';
import { formatUrgentDiffAlertMessage } from './notificationService';
import { messageQueue } from './queueService';
import { getTodayString, getTomorrowString } from '../utils/dateUtils';
import { logger, diffLogger } from '../utils/logger';

export interface ScheduleDiffChange {
  type: 'ROOM_CHANGED' | 'TIME_CHANGED' | 'TEACHER_CHANGED' | 'CANCELED' | 'NEW_CLASS';
  subjectName: string;
  groupName: string;
  description: string;
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

    if (!oldItem) {
      changes.push({
        type: 'NEW_CLASS',
        subjectName: newItem.TenMonHoc,
        groupName: newItem.TenNhom || '',
        description: `Bổ sung buổi học mới tại phòng ${newItem.TenPhong || 'N/A'}, GV: ${newItem.GiaoVien || 'N/A'}.`,
      });
    } else {
      // Room Change
      if (oldItem.TenPhong !== newItem.TenPhong) {
        changes.push({
          type: 'ROOM_CHANGED',
          subjectName: newItem.TenMonHoc,
          groupName: newItem.TenNhom || '',
          description: `Đổi phòng học từ "${oldItem.TenPhong || 'Chưa xếp'}" sang "${newItem.TenPhong || 'Chưa xếp'}".`,
        });
      }
      // Time Change
      if (oldItem.ThoiGianBD !== newItem.ThoiGianBD || oldItem.ThoiGianKT !== newItem.ThoiGianKT) {
        changes.push({
          type: 'TIME_CHANGED',
          subjectName: newItem.TenMonHoc,
          groupName: newItem.TenNhom || '',
          description: `Thay đổi giờ học từ (${oldItem.ThoiGianBD}) sang (${newItem.ThoiGianBD}).`,
        });
      }
      // Teacher Change
      if (oldItem.GiaoVien !== newItem.GiaoVien) {
        changes.push({
          type: 'TEACHER_CHANGED',
          subjectName: newItem.TenMonHoc,
          groupName: newItem.TenNhom || '',
          description: `Đổi giảng viên từ "${oldItem.GiaoVien || 'N/A'}" sang "${newItem.GiaoVien || 'N/A'}".`,
        });
      }
    }
  });

  // Check for canceled classes (existed in old snapshot but absent in new)
  oldSchedule.forEach((oldItem) => {
    const key = oldItem.ID ? String(oldItem.ID) : `${oldItem.NhomID}_${oldItem.ThoiGianBD}`;
    if (!newMap.has(key)) {
      changes.push({
        type: 'CANCELED',
        subjectName: oldItem.TenMonHoc,
        groupName: oldItem.TenNhom || '',
        description: `Hủy buổi học môn ${oldItem.TenMonHoc} (dự kiến học tại phòng ${oldItem.TenPhong}).`,
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
  dateStr: string
): Promise<void> {
  const fetchResult = await fetchStudentSchedule(studentId, dateStr);

  // Anti-false-alarm safeguard:
  // If API call fails or degraded, log and skip comparison
  if (!fetchResult.success) {
    logger.warn(`API_DEGRADED: Skipping diff engine for ${studentId} on ${dateStr} due to API error: ${fetchResult.error}`);
    return;
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

  const newSchedule = fetchResult.scheduleList;

  // If snapshot exists, calculate diff
  if (existingSnapshot) {
    const changes = computeScheduleDiff(oldSchedule, newSchedule);

    if (changes.length > 0) {
      diffLogger.info(`Schedule changes detected for ${studentId} (${zaloUserId}) on ${dateStr}: ${JSON.stringify(changes)}`);

      const todayStr = getTodayString();
      const tomorrowStr = getTomorrowString();

      // High Priority Alert for Today or Tomorrow
      if (dateStr === todayStr || dateStr === tomorrowStr) {
        const studentName = fetchResult.studentName || zaloName || studentId;
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
      await checkStudentDiffForDate(student.zaloUserId, student.studentId, student.zaloName, todayStr);
      await checkStudentDiffForDate(student.zaloUserId, student.studentId, student.zaloName, tomorrowStr);
    }

    logger.info('Diff Scanner cycle completed successfully.');
  } catch (error: any) {
    logger.error(`Error in runDiffScannerAllActiveStudents: ${error.message}`);
  }
}
