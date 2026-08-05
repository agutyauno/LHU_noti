import { Bot as ZaloBot, Message, BotErrorContext, FetchRequest } from 'zalo-bot-js';
import { prisma } from './prismaService';
import { fetchStudentSchedule } from './lhuService';
import {
  formatDailyScheduleMessage,
  formatWeeklyScheduleMessage,
} from './notificationService';
import { messageQueue } from './queueService';
import { getTodayString, getTomorrowString, getCurrentWeekDays } from '../utils/dateUtils';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export type BotStatus = 'DISCONNECTED' | 'CONNECTING' | 'READY' | 'SESSION_EXPIRED';

let botStatus: BotStatus = 'DISCONNECTED';
let zaloBotInstance: ZaloBot | null = null;
let isPollingLoopActive = false;

export function getBotStatus(): BotStatus {
  return botStatus;
}

export async function processZaloWebhookUpdate(payload: any): Promise<void> {
  if (!zaloBotInstance || !payload) return;

  let normalizedPayload = payload;
  if (payload.result && typeof payload.result === 'object' && payload.result.message) {
    normalizedPayload = {
      update_id: payload.update_id || payload.result.update_id || Date.now(),
      ...payload.result,
    };
  }

  await zaloBotInstance.processUpdate(normalizedPayload);
}

export async function initZaloBot(): Promise<void> {
  try {
    botStatus = 'CONNECTING';
    logger.info(`Initializing Zalo Bot Service in [${config.botMode.toUpperCase()}] mode...`);

    const token = config.zaloBotToken || 'default_zalo_bot_token';

    // Create FetchRequests with 30s timeout
    const fetchTransport = new FetchRequest({ readTimeout: 30000 });
    const pollingTransport = new FetchRequest({ readTimeout: 30000 });

    const bot = new ZaloBot({
      token,
      request: fetchTransport,
      pollingRequest: pollingTransport,
    });
    zaloBotInstance = bot;

    // Register queue handler for outgoing messages
    messageQueue.setSendHandler(async (zaloUserId: string, message: string) => {
      if (!zaloBotInstance || botStatus !== 'READY') {
        logger.warn(`Zalo Bot not ready (Status: ${botStatus}). Unable to dispatch message to ${zaloUserId}`);
        return false;
      }
      try {
        logger.info(`Dispatching Zalo message to recipient: ${zaloUserId} (Length: ${message.length} chars)`);
        const sentMsg = await zaloBotInstance.sendMessage(zaloUserId, message);
        
        // If messageId starts with 'local-', zalo-bot-js created a fallback object because Zalo API returned an error
        if (sentMsg?.messageId?.startsWith('local-')) {
          logger.error(
            `Zalo API delivery failed for recipient ${zaloUserId}. Raw response from Zalo: ${JSON.stringify((sentMsg as any)?.raw || {})}`
          );
          return false;
        }

        logger.info(`Zalo message delivered successfully to ${zaloUserId}. Message ID: ${sentMsg?.messageId || 'N/A'}`);
        return true;
      } catch (err: any) {
        logger.error(`Error in zaloBotInstance.sendMessage to ${zaloUserId}: ${err.message}`);
        return false;
      }
    });

    // Error handler
    bot.onError((err: unknown, context: BotErrorContext) => {
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('InvalidToken') || errMessage.includes('rejectedToken') || errMessage.includes('401')) {
        botStatus = 'SESSION_EXPIRED';
        logger.error('CRITICAL: Zalo Bot Token expired or rejected! Admin check required.');
      } else {
        logger.debug(`Zalo Bot notice: ${errMessage}`);
      }
    });

    // Message handler
    bot.on('message', async (msg: Message) => {
      try {
        const chatId = msg.chat?.id || msg.fromUser?.id || '';
        const senderName = msg.fromUser?.displayName || msg.fromUser?.accountName || 'User';
        const body = msg.text || '';

        logger.info(`Zalo Bot Event: Received message from ChatID [${chatId}] (${senderName}): "${body}"`);

        if (chatId) {
          await handleIncomingZaloMessage({
            from: chatId,
            senderName,
            body,
          });
        }
      } catch (err: any) {
        logger.error(`Error handling incoming Zalo message: ${err.message}`);
      }
    });

    // Attempt initialize
    await bot.initialize();
    botStatus = 'READY';

    if (config.botMode === 'polling') {
      try {
        await bot.deleteWebhook();
        logger.info('Cleared previous Webhook URL from Zalo API to activate Polling mode.');
      } catch (err: any) {
        logger.debug(`Notice clearing Webhook: ${err.message}`);
      }
      logger.info(`Zalo Bot authenticated and READY! (Polling Mode Active - Interval: ${config.botPollIntervalMs}ms)`);
      startSafePollingLoop(bot);
    } else {
      if (config.zaloWebhookUrl) {
        try {
          const webhookEndpoint = config.zaloWebhookUrl.endsWith('/api/zalo-webhook')
            ? config.zaloWebhookUrl
            : `${config.zaloWebhookUrl.replace(/\/$/, '')}/api/zalo-webhook`;

          logger.info(`Setting Webhook URL with Zalo API: ${webhookEndpoint}`);
          await bot.setWebhook(webhookEndpoint, config.zaloWebhookSecret);
          logger.info(`Successfully registered Webhook URL with Zalo API.`);

          logger.info('Calling getWebhookInfo to verify Zalo Webhook configuration...');
          const webhookInfo = await bot.getWebhookInfo();
          if (webhookInfo) {
            logger.info(`Zalo Webhook Info Verified: URL = "${webhookInfo.url}"${webhookInfo.updatedAt ? `, UpdatedAt = ${webhookInfo.updatedAt}` : ''}`);
          } else {
            logger.warn('Unable to verify Webhook Info: Zalo API returned empty data.');
          }
        } catch (err: any) {
          logger.warn(`Notice setting/verifying Webhook URL: ${err.message}`);
        }
      } else {
        logger.info('Zalo Bot Webhook Mode Active. (Fill ZALO_WEBHOOK_URL in .env for auto-registration)');
      }
      logger.info('Zalo Bot authenticated and READY! (Webhook Mode Active)');
    }
  } catch (error: any) {
    botStatus = 'SESSION_EXPIRED';
    logger.error(`Failed to initialize Zalo Bot: ${error.message}`);
    logger.warn('Zalo Bot in standby mode. Web server and scheduler remain active.');
  }
}

/**
 * Safe Custom Polling Loop that catches Gateway 504 HTML timeouts cleanly
 */
async function startSafePollingLoop(bot: ZaloBot) {
  if (isPollingLoopActive) return;
  isPollingLoopActive = true;

  while (isPollingLoopActive && botStatus === 'READY') {
    try {
      const updates = await bot.getUpdates({ timeout: 0 });
      if (updates && updates.length > 0) {
        for (const update of updates) {
          await bot.processUpdate(update);
        }
      }
    } catch (err: any) {
      // Gracefully ignore Nginx 504 Gateway HTML or transient polling errors
      logger.debug(`Polling loop tick notice: ${err.message || 'Transient error'}`);
    }

    // Sleep before next poll cycle
    await new Promise((resolve) => setTimeout(resolve, config.botPollIntervalMs));
  }
}

/**
 * Handle incoming message from Zalo User
 */
export async function handleIncomingZaloMessage(msg: {
  from: string;
  senderName?: string;
  body: string;
}): Promise<string> {
  const zaloUserId = msg.from;
  const rawText = (msg.body || '').trim();
  const lowerText = rawText.toLowerCase();

  logger.info(`Received Zalo message from ${zaloUserId} (${msg.senderName || 'User'}): "${rawText}"`);

  // 1. Command: /help
  if (lowerText === '/help' || lowerText === 'help' || lowerText === 'trogiup') {
    const helpMsg = getHelpText();
    messageQueue.enqueue(zaloUserId, helpMsg);
    return helpMsg;
  }

  // 2. Command: /dangky <student_id> (Step 1)
  if (lowerText.startsWith('/dangky') || lowerText.startsWith('dangky')) {
    const parts = rawText.split(/\s+/);
    const studentId = parts[1]?.trim();

    if (!studentId) {
      const reply = `⚠️ Vui lòng nhập đúng cú pháp: /dangky <Mã_Số_Sinh_Viên>\nVí dụ: /dangky 121000123`;
      messageQueue.enqueue(zaloUserId, reply);
      return reply;
    }

    // Step 1: Call LHU API to verify Student Name
    const fetchResult = await fetchStudentSchedule(studentId, getTodayString());

    if (!fetchResult.success && !fetchResult.studentName) {
      const reply = `❌ Không tìm thấy thông tin sinh viên với MSSV: ${studentId} trên hệ thống LHU.\nVui lòng kiểm tra lại mã số sinh viên của bạn.`;
      messageQueue.enqueue(zaloUserId, reply);
      return reply;
    }

    const studentName = fetchResult.studentName || 'Sinh viên LHU';

    // Store in pendingStudentId for 2-step verification
    await prisma.student.upsert({
      where: { zaloUserId },
      update: {
        pendingStudentId: studentId,
        zaloName: msg.senderName || studentName,
      },
      create: {
        zaloUserId,
        zaloName: msg.senderName || studentName,
        studentId: '', // Will be updated on confirmation
        pendingStudentId: studentId,
        isActive: false,
      },
    });

    const reply = `🔍 XÁC NHẬN THÔNG TIN SINH VIÊN (Bước 1/2):\n- Họ và tên: ${studentName}\n- Mã số sinh viên: ${studentId}\n\n👉 Nhắn "OK" hoặc "XACNHAN" để xác nhận đăng ký nhận thông báo lịch học qua Zalo!`;
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // 3. Step 2 Confirmation: "OK" or "XACNHAN"
  if (lowerText === 'ok' || lowerText === 'xacnhan') {
    const existing = await prisma.student.findUnique({ where: { zaloUserId } });

    if (!existing || !existing.pendingStudentId) {
      const reply = `⚠️ Bạn chưa thực hiện bước 1. Vui lòng gõ cú pháp: /dangky <Mã_Số_Sinh_Viên>\nVí dụ: /dangky 121000123`;
      messageQueue.enqueue(zaloUserId, reply);
      return reply;
    }

    const finalStudentId = existing.pendingStudentId;

    await prisma.student.update({
      where: { zaloUserId },
      data: {
        studentId: finalStudentId,
        pendingStudentId: null,
        isActive: true,
      },
    });

    const reply = `✅ ĐĂNG KÝ THÀNH CÔNG!\n- Hệ thống đã liên kết tài khoản Zalo với MSSV: ${finalStudentId}\n- Lịch học ngày mai sẽ tự động gửi lúc 20:00 hàng ngày.\n- Nhắn /help để xem các lệnh tra cứu nhanh.`;
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // 4. Command: /huy
  if (lowerText === '/huy' || lowerText === 'huy') {
    const existing = await prisma.student.findUnique({ where: { zaloUserId } });
    if (!existing || !existing.isActive) {
      const reply = `ℹ️ Bạn chưa đăng ký hoặc dịch vụ thông báo đã tắt. Gõ /dangky <MSSV> để đăng ký lại.`;
      messageQueue.enqueue(zaloUserId, reply);
      return reply;
    }

    await prisma.student.update({
      where: { zaloUserId },
      data: { isActive: false },
    });

    const reply = `🔴 ĐÃ HỦY ĐĂNG KÝ THÀNH CÔNG.\nBạn sẽ không còn nhận các thông báo lịch học tự động từ Zalo Bot. Nhắn /dangky <MSSV> bất kỳ lúc nào để bật lại.`;
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // Find user in DB for studentId checks
  const student = await prisma.student.findUnique({ where: { zaloUserId } });
  if (!student || !student.isActive || !student.studentId) {
    const reply = `👋 Chào bạn! Bạn chưa liên kết MSSV LHU với Zalo Bot.\nVui lòng nhắn: /dangky <Mã_Số_Sinh_Viên>\nVí dụ: /dangky 121000123`;
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // 5. Command: /homnay
  if (lowerText === '/homnay' || lowerText === 'homnay') {
    const todayStr = getTodayString();
    const result = await fetchStudentSchedule(student.studentId, todayStr);
    const reply = formatDailyScheduleMessage(
      result.studentName || student.zaloName || student.studentId,
      todayStr,
      result.scheduleList,
      'LỊCH HỌC HÔM NAY'
    );
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // 6. Command: /ngaymai
  if (lowerText === '/ngaymai' || lowerText === 'ngaymai') {
    const tomorrowStr = getTomorrowString();
    const result = await fetchStudentSchedule(student.studentId, tomorrowStr);
    const reply = formatDailyScheduleMessage(
      result.studentName || student.zaloName || student.studentId,
      tomorrowStr,
      result.scheduleList,
      'LỊCH HỌC NGÀY MAI'
    );
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // 7. Command: /tuannay
  if (lowerText === '/tuannay' || lowerText === 'tuannay') {
    const weekDays = getCurrentWeekDays();
    const mondayStr = weekDays[0];

    // Single API call starting from Monday of the week
    const res = await fetchStudentSchedule(student.studentId, mondayStr, 100, false);
    const studentName = res.studentName || student.zaloName || student.studentId;
    const rawSchedule = res.scheduleList || [];

    const weeklyMap: Array<{ date: string; schedule: any[] }> = [];
    for (const date of weekDays) {
      const daySchedule = rawSchedule.filter((item) => item?.ThoiGianBD && item.ThoiGianBD.startsWith(date));
      weeklyMap.push({ date, schedule: daySchedule });
    }

    const reply = formatWeeklyScheduleMessage(studentName, weeklyMap);
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // 8. Command: /trangthai
  if (lowerText === '/trangthai' || lowerText === 'trangthai') {
    const reply = `📊 THÔNG TIN CẤU HÌNH DỊCH VỤ:\n- MSSV Liên kết: ${student.studentId}\n- Tên Zalo: ${student.zaloName || 'N/A'}\n- Trạng thái hoạt động: ${student.isActive ? '🟢 ĐANG BẬT' : '🔴 ĐÃ TẮT'}\n- Nhận thông báo lịch ngày mai: ${student.notifyTomorrow ? '✅ BẬT' : '❌ TẮT'}\n- Giờ nhận thông báo ngày mai: ${student.notifyTime}`;
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // 9. Command: /caidat <HH:mm|tat>
  if (lowerText.startsWith('/caidat') || lowerText.startsWith('caidat')) {
    const parts = rawText.split(/\s+/);
    const arg = parts[1]?.toLowerCase();

    if (!arg) {
      const reply = `⚙️ CÚ PHÁP CÀI ĐẶT THÔNG BÁO:\n- Đổi giờ nhận tin: /caidat HH:mm (Ví dụ: /caidat 21:00)\n- Tắt tin ngày mai: /caidat tat`;
      messageQueue.enqueue(zaloUserId, reply);
      return reply;
    }

    if (arg === 'tat' || arg === 'off') {
      await prisma.student.update({
        where: { zaloUserId },
        data: { notifyTomorrow: false },
      });
      const reply = `❌ Đã tắt thông báo lịch học ngày mai hàng ngày. Nhắn /caidat 20:00 để bật lại.`;
      messageQueue.enqueue(zaloUserId, reply);
      return reply;
    }

    // Time validation (HH:mm format e.g. 20:00 or 08:30)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(arg)) {
      const reply = `⚠️ Giờ không hợp lệ! Vui lòng định dạng HH:mm (Ví dụ: 20:00, 21:30, 07:00).`;
      messageQueue.enqueue(zaloUserId, reply);
      return reply;
    }

    // Normalize format to HH:mm (e.g. "8:00" -> "08:00")
    const [h, m] = arg.split(':');
    const normalizedTime = `${String(parseInt(h, 10)).padStart(2, '0')}:${m}`;

    await prisma.student.update({
      where: { zaloUserId },
      data: { notifyTomorrow: true, notifyTime: normalizedTime },
    });

    const reply = `✅ Đã cập nhật giờ nhận thông báo lịch học ngày mai thành: ${normalizedTime} hàng ngày!`;
    messageQueue.enqueue(zaloUserId, reply);
    return reply;
  }

  // Fallback default message
  const fallback = `🤖 Zalo Bot LHU Notifier không hiểu câu lệnh "${rawText}".\nNhắn /help để xem danh sách câu lệnh hỗ trợ.`;
  messageQueue.enqueue(zaloUserId, fallback);
  return fallback;
}

function getHelpText(): string {
  return `🤖 [BẢNG HƯỚNG DẪN SỬ DỤNG ZALO BOT LHU]

📌 DANH SÁCH CÂU LỆNH CHAT:
1. /dangky <MSSV> : Liên kết MSSV (Quy trình 2 bước với xác nhận OK).
2. OK / XACNHAN : Xác nhận hoàn tất đăng ký ở bước 2.
3. /homnay : Tra cứu lịch học hôm nay.
4. /ngaymai : Tra cứu lịch học ngày mai.
5. /tuannay : Tra cứu lịch học cả tuần (T2 - CN).
6. /trangthai : Xem cấu hình và trạng thái thông báo.
7. /caidat <HH:mm|tat> : Đổi giờ nhận tin (VD: /caidat 21:00) hoặc /caidat tat.
8. /huy : Hủy nhận thông báo từ hệ thống.
9. /help : Xem trợ giúp này.

---
🚀 Hệ thống sẽ tự động gửi thông báo khi có biến động lịch khẩn cấp!`;
}
