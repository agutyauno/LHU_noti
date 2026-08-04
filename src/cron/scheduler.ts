import cron from 'node-cron';
import { prisma } from '../services/prismaService';
import { fetchStudentSchedule } from '../services/lhuService';
import { formatDailyScheduleMessage } from '../services/notificationService';
import { messageQueue } from '../services/queueService';
import { runDiffScannerAllActiveStudents } from '../services/diffService';
import { getTomorrowString } from '../utils/dateUtils';
import { logger } from '../utils/logger';

export function startCronScheduler(): void {
  logger.info('Initializing Cron Task Scheduler...');

  // 1. Every minute job: Daily Tomorrow Alert Check
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;

      // Query active students set for this exact notifyTime
      const targetStudents = await prisma.student.findMany({
        where: {
          isActive: true,
          notifyTomorrow: true,
          notifyTime: currentTimeStr,
        },
      });

      if (targetStudents.length > 0) {
        logger.info(`Cron [Minute Check]: Found ${targetStudents.length} student(s) scheduled for daily alert at ${currentTimeStr}`);
        const tomorrowStr = getTomorrowString();

        for (const student of targetStudents) {
          const fetchResult = await fetchStudentSchedule(student.studentId, tomorrowStr);
          const studentName = fetchResult.studentName || student.zaloName || student.studentId;
          const msgContent = formatDailyScheduleMessage(
            studentName,
            tomorrowStr,
            fetchResult.scheduleList,
            'LỊCH HỌC NGÀY MAI'
          );

          messageQueue.enqueue(student.zaloUserId, msgContent);
        }
      }
    } catch (err: any) {
      logger.error(`Error in Daily Schedule Cron Job: ${err.message}`);
    }
  });

  // 2. Every 5 minutes job: Sudden Change Scanner
  cron.schedule('*/5 * * * *', async () => {
    logger.info('Cron [5-min Check]: Starting Sudden Schedule Change Scanner...');
    try {
      await runDiffScannerAllActiveStudents();
    } catch (err: any) {
      logger.error(`Error in Diff Scanner Cron Job: ${err.message}`);
    }
  });

  logger.info('Cron Scheduler successfully started (1-min daily checker & 5-min diff scanner).');
}
