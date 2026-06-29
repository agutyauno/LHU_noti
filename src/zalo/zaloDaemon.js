import { Zalo, LoginQRCallbackEventType } from "zca-js";
import db from "../db/index.js";
import { syncUserSchedule } from "../services/lhuService.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import sharp from "sharp";

dotenv.config();

let apiInstance = null;
let isStartingQR = false;
let currentFlowId = 0;
let queueIntervalId = null;
let syncIntervalId = null;

// Format helper for dates
const formatLocalTime = (date) => {
  const pad = (num) => String(num).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
};

/**
 * Periodically updates the bot heartbeat in SQLite so Next.js knows it is active.
 * Also checks if the Web UI requested a bot reset/logout.
 */
function runHeartbeat() {
  setInterval(async () => {
    try {
      // 1. Update heartbeat
      db.prepare(`
        UPDATE zalo_sessions
        SET updated_at = CURRENT_TIMESTAMP
        WHERE key = 'bot_session'
      `).run();

      // 2. Check if bot logout was requested from the Web Dashboard or status is DISCONNECTED
      const session = db.prepare("SELECT status FROM zalo_sessions WHERE key = 'bot_session'").get();
      if (session && session.status === 'DISCONNECTED') {
        console.log("[Daemon] Web UI requested a bot reset or status is DISCONNECTED. Starting QR Login Flow...");
        
        // Stop listener if running
        if (apiInstance) {
          try {
            if (apiInstance.listener) {
              apiInstance.listener.stop();
            }
          } catch (e) {
            console.error("[Daemon] Error stopping listener:", e.message);
          }
          apiInstance = null;
        }

        // Clear intervals
        if (queueIntervalId) clearInterval(queueIntervalId);
        if (syncIntervalId) clearInterval(syncIntervalId);
        queueIntervalId = null;
        syncIntervalId = null;

        // Automatically force-start the QR login flow
        startQRLoginFlow(true);
      }
    } catch (err) {
      console.error("[Daemon] Heartbeat update failed:", err.message);
    }
  }, 10000);
}

/**
 * Fetches and stores the bot's own profile and contact QR code in the database
 */
async function storeBotProfile(api, status, extraData = {}) {
  try {
    const ownId = api.getOwnId();
    const profileRes = await api.fetchAccountInfo();
    const qrRes = await api.getQR(ownId);
    const profileData = {
      displayName: profileRes.profile.displayName,
      username: profileRes.profile.username,
      avatar: profileRes.profile.avatar,
      qrUrl: qrRes[ownId]
    };
    
    const baseQuery = {
      status,
      error_message: null,
      profile_info: JSON.stringify(profileData),
      ...extraData
    };
    
    const cols = Object.keys(baseQuery);
    const setExpr = cols.map(c => `${c} = ?`).join(", ");
    const vals = cols.map(c => baseQuery[c]);
    vals.push("bot_session");
    
    db.prepare(`
      UPDATE zalo_sessions
      SET ${setExpr}, updated_at = CURRENT_TIMESTAMP
      WHERE key = ?
    `).run(...vals);
    console.log(`[Daemon] Successfully logged in and stored bot profile for ${profileRes.profile.displayName}`);
  } catch (err) {
    console.error("[Daemon] Error storing bot profile:", err.message);
    const baseQuery = {
      status,
      error_message: `Profile fetch warning: ${err.message}`,
      ...extraData
    };
    const cols = Object.keys(baseQuery);
    const setExpr = cols.map(c => `${c} = ?`).join(", ");
    const vals = cols.map(c => baseQuery[c]);
    vals.push("bot_session");
    db.prepare(`
      UPDATE zalo_sessions
      SET ${setExpr}, updated_at = CURRENT_TIMESTAMP
      WHERE key = ?
    `).run(...vals);
  }
}

/**
 * Starts the Zalo Bot Daemon
 */
async function startDaemon() {
  console.log("[Daemon] Starting Zalo Bot background daemon...");
  runHeartbeat();
  
  // Try to restore session from DB
  const session = db.prepare("SELECT * FROM zalo_sessions WHERE key = 'bot_session'").get();
  if (session && session.cookie && session.status === 'CONNECTED') {
    console.log("[Daemon] Found existing Zalo session. Attempting cookie login...");
    try {
      const cookies = JSON.parse(session.cookie);
      const imei = session.imei;
      const userAgent = session.user_agent;
      
      const zalo = new Zalo({
        selfListen: false,
        imageMetadataGetter: async (filePath) => {
          const data = await fs.promises.readFile(filePath);
          const metadata = await sharp(data).metadata();
          return {
            height: metadata.height,
            width: metadata.width,
            size: metadata.size || data.length,
          };
        }
      });
      
      apiInstance = await zalo.login({
        cookie: cookies,
        imei,
        userAgent
      });
      
      await storeBotProfile(apiInstance, 'CONNECTED');
      
      setupListener(apiInstance);
      startNotificationScheduler();
    } catch (err) {
      console.error("[Daemon] Cookie login failed:", err.message);
      db.prepare(`
        UPDATE zalo_sessions
        SET status = 'DISCONNECTED', error_message = ?
        WHERE key = 'bot_session'
      `).run(err.message);
      
      await startQRLoginFlow();
    }
  } else {
    console.log("[Daemon] No active session found. Spawning QR Login Flow...");
    await startQRLoginFlow();
  }
}

/**
 * Initiates the QR Login Flow
 */
async function startQRLoginFlow(force = false) {
  if (isStartingQR && !force) return;
  isStartingQR = true;
  
  currentFlowId++;
  const flowId = currentFlowId;
  
  db.prepare(`
    INSERT OR REPLACE INTO zalo_sessions (key, status, qr_code_data, error_message)
    VALUES ('bot_session', 'QR_GENERATING', NULL, NULL)
  `).run();

  const zalo = new Zalo({
    selfListen: false,
    imageMetadataGetter: async (filePath) => {
      const data = await fs.promises.readFile(filePath);
      const metadata = await sharp(data).metadata();
      return {
        height: metadata.height,
        width: metadata.width,
        size: metadata.size || data.length,
      };
    }
  });

  try {
    const api = await zalo.loginQR({}, async (event) => {
      if (flowId !== currentFlowId) {
        console.log(`[Daemon] Ignoring event from obsolete QR flow ${flowId}`);
        return;
      }
      
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          const qrBase64 = event.data.image.startsWith("data:") ? event.data.image : `data:image/png;base64,${event.data.image}`;
          db.prepare(`
            UPDATE zalo_sessions
            SET status = 'QR_READY', qr_code_data = ?
            WHERE key = 'bot_session'
          `).run(qrBase64);
          console.log("[Daemon] QR Code generated successfully. Please scan from Web Admin.");
          break;
        }
        case LoginQRCallbackEventType.QRCodeScanned: {
          db.prepare(`
            UPDATE zalo_sessions
            SET status = 'QR_SCANNED', error_message = ?
            WHERE key = 'bot_session'
          `).run(`Scanned by ${event.data.display_name}`);
          console.log(`[Daemon] QR Code scanned by ${event.data.display_name}. Waiting for authorization...`);
          break;
        }
        case LoginQRCallbackEventType.GotLoginInfo: {
          const cookieStr = JSON.stringify(event.data.cookie);
          db.prepare(`
            UPDATE zalo_sessions
            SET status = 'CONNECTED', cookie = ?, imei = ?, user_agent = ?, error_message = NULL
            WHERE key = 'bot_session'
          `).run(cookieStr, event.data.imei, event.data.userAgent);
          console.log("[Daemon] QR Login authorization successful! Credentials saved to SQLite.");
          break;
        }
        case LoginQRCallbackEventType.QRCodeExpired: {
          db.prepare(`
            UPDATE zalo_sessions
            SET status = 'DISCONNECTED', error_message = 'QR Code Expired'
            WHERE key = 'bot_session'
          `).run();
          console.log("[Daemon] QR Code expired.");
          break;
        }
        case LoginQRCallbackEventType.QRCodeDeclined: {
          db.prepare(`
            UPDATE zalo_sessions
            SET status = 'DISCONNECTED', error_message = 'QR Login Declined'
            WHERE key = 'bot_session'
          `).run();
          console.log("[Daemon] QR Login declined by user.");
          break;
        }
      }
    });

    if (flowId !== currentFlowId) {
      console.log(`[Daemon] Ignoring API resolution from obsolete QR flow ${flowId}`);
      return;
    }

    apiInstance = api;
    isStartingQR = false;
    await storeBotProfile(apiInstance, 'CONNECTED');
    setupListener(apiInstance);
    startNotificationScheduler();
  } catch (err) {
    if (flowId !== currentFlowId) {
      console.log(`[Daemon] Ignoring error from obsolete QR flow ${flowId}`);
      return;
    }
    
    console.error("[Daemon] QR Login error:", err.message);
    db.prepare(`
      UPDATE zalo_sessions
      SET status = 'DISCONNECTED', error_message = ?
      WHERE key = 'bot_session'
    `).run(err.message);
    isStartingQR = false;
  }
}

/**
 * Sets up incoming event listener on Zalo
 */
function setupListener(api) {
  console.log("[Daemon] Setting up Zalo incoming message listener...");
  
  api.listener.on("message", async (message) => {
    // Only handle personal incoming messages from others
    if (message.isSelf) return;
    
    const content = message.data.content;
    const threadId = message.threadId;
    
    if (typeof content !== "string") return;
    
    const text = content.trim();
    console.log(`[Daemon] Message from thread ${threadId}: "${text}"`);
    
    if (text.toUpperCase().startsWith("DK ")) {
      const studentId = text.substring(3).trim();
      if (!studentId) {
        await api.sendMessage("Cú pháp không hợp lệ. Vui lòng nhắn: DK [MSSV/MSCB] (Ví dụ: DK 123000784)", threadId);
        return;
      }
      
      try {
        // Find if user already registered on web portal
        const user = db.prepare("SELECT * FROM users WHERE student_id = ?").get(studentId);
        
        if (user) {
          // Update thread ID
          db.prepare("UPDATE users SET zalo_thread_id = ? WHERE student_id = ?").run(threadId, studentId);
          
          const name = user.fullname || "Sinh viên/Giảng viên";
          await api.sendMessage(`Đăng ký nhận lịch học thành công cho ${name} (Mã: ${studentId})!`, threadId);
          console.log(`[Daemon] Registered Zalo Thread ID for student ${studentId}: ${threadId}`);
          
          // Instantly sync their schedule
          await syncUserSchedule(studentId);
          scheduleUserNotifications(studentId);
        } else {
          // User not found on web system. Suggest registering on the web app first.
          await api.sendMessage(
            `Mã số ${studentId} chưa đăng ký tài khoản trên hệ thống Web. Vui lòng truy cập trang Web để tạo tài khoản trước, sau đó gửi tin nhắn cú pháp 'DK ${studentId}' để liên kết.`, 
            threadId
          );
        }
      } catch (err) {
        console.error("[Daemon] Error in registration message handler:", err.message);
        await api.sendMessage("Có lỗi xảy ra trong quá trình xử lý đăng ký. Vui lòng thử lại sau.", threadId);
      }
    } else if (text.toUpperCase().startsWith("HDK ")) {
      const studentId = text.substring(4).trim();
      if (!studentId) {
        await api.sendMessage("Cú pháp không hợp lệ. Vui lòng nhắn: HDK [MSSV/MSCB] (Ví dụ: HDK 123000784)", threadId);
        return;
      }
      
      try {
        const user = db.prepare("SELECT * FROM users WHERE student_id = ?").get(studentId);
        
        if (!user) {
          await api.sendMessage(`Mã số ${studentId} chưa được đăng ký trên hệ thống.`, threadId);
          return;
        }
        
        if (user.zalo_thread_id !== threadId) {
          await api.sendMessage(`Mã số ${studentId} chưa được liên kết với tài khoản Zalo này. Bạn không thể hủy liên kết tài khoản của người khác.`, threadId);
          return;
        }
        
        // 1. Unlink Zalo thread ID (set to NULL)
        db.prepare("UPDATE users SET zalo_thread_id = NULL WHERE student_id = ?").run(studentId);
        
        // 2. Clear all PENDING notifications for this user
        db.prepare(`
          DELETE FROM queue_notifications 
          WHERE student_id = ? AND status = 'PENDING'
        `).run(studentId);
        
        await api.sendMessage(`Hủy nhận thông báo lịch học thành công cho mã số ${studentId}.`, threadId);
        console.log(`[Daemon] Unlinked Zalo Thread ID for student ${studentId}`);
      } catch (err) {
        console.error("[Daemon] Error in unregistration message handler:", err.message);
        await api.sendMessage("Có lỗi xảy ra trong quá trình hủy đăng ký. Vui lòng thử lại sau.", threadId);
      }
    }
  });

  api.listener.on("friend_event", async (event) => {
    // Check if event is Friend Request (2)
    if (event.type === 2) {
      const friendId = event.data.fromUid;
      console.log(`[Daemon] Auto-accepting friend request from ${friendId}...`);
      try {
        await api.acceptFriendRequest(friendId);
        console.log(`[Daemon] Accepted friend request from: ${friendId}`);
        await api.sendMessage(
          "Chào bạn! Mình là Bot nhắc lịch học LHU. Hãy đăng ký tài khoản trên Web, sau đó gửi tin nhắn cú pháp 'DK [MSSV/MSCB]' (ví dụ: DK 123000784) để nhận tin nhắn thông báo nhắc lịch học tự động nhé!", 
          friendId
        );
      } catch (err) {
        console.error(`[Daemon] Friend request accept error for ${friendId}:`, err.message);
      }
    }
  });

  api.listener.start();
  console.log("[Daemon] Zalo listener started.");
}

/**
 * Calculates scheduled times and insert reminders into queue_notifications for a user
 */
function scheduleUserNotifications(studentId) {
  try {
    const user = db.prepare("SELECT * FROM users WHERE student_id = ?").get(studentId);
    if (!user || !user.zalo_thread_id) return;

    // Clean up future PENDING reminders first
    db.prepare(`
      DELETE FROM queue_notifications 
      WHERE student_id = ? AND status = 'PENDING' AND message LIKE '[LHU] Nhắc lịch học%'
    `).run(studentId);

    // Get upcoming schedules limited to 30 sessions
    const todayStr = new Date().toISOString().split("T")[0];
    const schedules = db.prepare(`
      SELECT * FROM schedules 
      WHERE student_id = ? AND date >= ? 
      ORDER BY date ASC, time_start ASC 
      LIMIT 30
    `).all(studentId, todayStr);
    
    const insertQueue = db.prepare(`
      INSERT INTO queue_notifications (student_id, zalo_thread_id, message, scheduled_time, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `);

    const checkExists = db.prepare(`
      SELECT count(*) as count FROM queue_notifications 
      WHERE student_id = ? AND scheduled_time = ? AND message LIKE ?
    `);

    for (const sch of schedules) {
      // 1. Remind before class
      const [classHour, classMin] = sch.time_start.split(":").map(Number);
      const classDate = new Date(sch.date);
      classDate.setHours(classHour, classMin, 0);

      const reminderTime = new Date(classDate.getTime() - user.receive_time_before_mins * 60000);
      const now = new Date();

      if (reminderTime > now) {
        const scheduledTimeStr = formatLocalTime(reminderTime);
        const msgText = `[LHU] Nhắc lịch học: Môn '${sch.subject_name}' sẽ bắt đầu lúc ${sch.time_start} tại phòng ${sch.room} (GV: ${sch.teacher}, Lớp: ${sch.class_name || 'Chưa rõ'}).`;
        
        const exists = checkExists.get(studentId, scheduledTimeStr, `%Nhắc lịch học: Môn '${sch.subject_name}'%`);
        if (exists.count === 0) {
          insertQueue.run(studentId, user.zalo_thread_id, msgText, scheduledTimeStr);
          console.log(`[Daemon] Queued class reminder for ${studentId} at ${scheduledTimeStr}`);
        }
      }

      // 2. Remind night before class
      if (user.receive_night_before === 1) {
        const nightBeforeDate = new Date(sch.date);
        nightBeforeDate.setDate(nightBeforeDate.getDate() - 1);
        nightBeforeDate.setHours(20, 0, 0); // 8:00 PM the night before

        if (nightBeforeDate > now) {
          const scheduledTimeStr = formatLocalTime(nightBeforeDate);
          const msgText = `[LHU] Nhắc lịch học ngày mai (${sch.date}): Môn '${sch.subject_name}' bắt đầu lúc ${sch.time_start} tại phòng ${sch.room} (GV: ${sch.teacher}).`;
          
          const exists = checkExists.get(studentId, scheduledTimeStr, `%ngày mai (${sch.date}): Môn '${sch.subject_name}'%`);
          if (exists.count === 0) {
            insertQueue.run(studentId, user.zalo_thread_id, msgText, scheduledTimeStr);
            console.log(`[Daemon] Queued night-before reminder for ${studentId} at ${scheduledTimeStr}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Daemon] Error scheduling notifications for ${studentId}:`, err.message);
  }
}

/**
 * Prunes sent and failed notifications to keep DB size bounded.
 * - Keeps at most 10 recent SENT notifications.
 * - Keeps FAILED notifications only within the past 7 days, and at most 10 total.
 */
function pruneNotifications(studentId) {
  try {
    // 1. Delete FAILED notifications older than 7 days
    db.prepare(`
      DELETE FROM queue_notifications 
      WHERE student_id = ? AND status = 'FAILED' AND sent_at < datetime('now', '-7 days')
    `).run(studentId);

    // 2. Keep only the 10 most recent SENT notifications
    db.prepare(`
      DELETE FROM queue_notifications 
      WHERE student_id = ? AND status = 'SENT' AND id NOT IN (
        SELECT id FROM queue_notifications 
        WHERE student_id = ? AND status = 'SENT' 
        ORDER BY sent_at DESC, id DESC 
        LIMIT 10
      )
    `).run(studentId, studentId);

    // 3. Keep only the 10 most recent FAILED notifications
    db.prepare(`
      DELETE FROM queue_notifications 
      WHERE student_id = ? AND status = 'FAILED' AND id NOT IN (
        SELECT id FROM queue_notifications 
        WHERE student_id = ? AND status = 'FAILED' 
        ORDER BY sent_at DESC, id DESC 
        LIMIT 10
      )
    `).run(studentId, studentId);
  } catch (err) {
    console.error(`[Daemon] Error pruning notifications for ${studentId}:`, err.message);
  }
}

/**
 * Runs a scheduler to sync and queue notifications
 */
function startNotificationScheduler() {
  // Clear any existing intervals to prevent duplicates
  if (queueIntervalId) clearInterval(queueIntervalId);
  if (syncIntervalId) clearInterval(syncIntervalId);

  console.log("[Daemon] Starting Notification Scheduler loops...");

  // 1. Process Outgoing Notification Queue every 10 seconds
  queueIntervalId = setInterval(async () => {
    if (!apiInstance) return;
    
    try {
      const nowStr = formatLocalTime(new Date());
      // Select pending notifications scheduled for now or earlier
      const pendings = db.prepare(`
        SELECT * FROM queue_notifications 
        WHERE status = 'PENDING' AND scheduled_time <= ?
      `).all(nowStr);

      for (const noti of pendings) {
        console.log(`[Daemon] Sending notification to ${noti.zalo_thread_id}: "${noti.message}"`);
        try {
          await apiInstance.sendMessage(noti.message, noti.zalo_thread_id);
          db.prepare(`
            UPDATE queue_notifications 
            SET status = 'SENT', sent_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(noti.id);
          console.log(`[Daemon] Notification ID ${noti.id} sent successfully.`);
          pruneNotifications(noti.student_id);
        } catch (err) {
          console.error(`[Daemon] Failed to send notification ID ${noti.id}:`, err.message);
          db.prepare(`
            UPDATE queue_notifications 
            SET status = 'FAILED', error_message = ?, sent_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(err.message, noti.id);
          pruneNotifications(noti.student_id);
        }
      }
    } catch (err) {
      console.error("[Daemon] Queue poll loop error:", err.message);
    }
  }, 10000);

  // 2. Perform Periodic LHU sync and Notification Queuing for all active users (every 5 minutes)
  const performSyncAndSchedule = async () => {
    console.log("[Daemon] Periodic sync job starting...");
    try {
      const activeUsers = db.prepare("SELECT student_id FROM users WHERE zalo_thread_id IS NOT NULL").all();
      for (const u of activeUsers) {
        try {
          await syncUserSchedule(u.student_id);
          scheduleUserNotifications(u.student_id);
        } catch (syncErr) {
          console.error(`[Daemon] Periodic sync failed for student ${u.student_id}:`, syncErr.message);
        }
      }
      console.log("[Daemon] Periodic sync job completed.");
    } catch (err) {
      console.error("[Daemon] Periodic sync manager error:", err.message);
    }
  };

  // Run immediately upon starting scheduler
  performSyncAndSchedule();
  // Loop every 5 minutes (300000ms)
  syncIntervalId = setInterval(performSyncAndSchedule, 300000);
}

// Start daemon process
startDaemon().catch((err) => {
  console.error("[Daemon] Fatal initialization error:", err);
});
