import db from "../db/index.js";

/**
 * Fetches the user schedule from LHU API (or returns mock data if not configured)
 * and upserts it into the SQLite schedules table.
 */
export async function syncUserSchedule(studentId) {
  const useMock = process.env.USE_MOCK === "true";
  const apiUrl = useMock 
    ? "http://localhost:3000/api/mock/lhu" 
    : process.env.LHU_API_URL;
  const apiKey = useMock ? "" : process.env.LHU_API_KEY;

  if (!useMock && !apiUrl) {
    throw new Error("LHU_API_URL is not configured in .env for real mode");
  }

  // If transitioning to real mode, clean up any old mock schedules for this student in SQLite DB
  if (!useMock) {
    db.prepare("DELETE FROM schedules WHERE student_id = ? AND id LIKE 'mock-%'").run(studentId);
  }

  let scheduleList = [];

  try {
    const today = new Date().toISOString();
    const payload = {
      StudentID: studentId,
      Ngay: today,
      PageIndex: 1,
      PageSize: 100
    };

    console.log(`[LHU Sync] Syncing schedules for ${studentId} (Mock: ${useMock}, URL: ${apiUrl})...`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey ? `Bearer ${apiKey}` : ""
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`LHU API responded with status ${response.status}`);
    }

    const resData = await response.json();

    // Parse data array - look for the third element data[2] or fallback
    let rawData = [];
    if (resData.data && Array.isArray(resData.data)) {
      rawData = resData.data[2] || resData.data;
    } else if (Array.isArray(resData)) {
      rawData = resData[2] || resData;
    }

    if (Array.isArray(rawData)) {
      scheduleList = rawData.map((item, idx) => {
        const dateStr = item.ThoiGianBD ? item.ThoiGianBD.split("T")[0] : (item.Date || item.Ngay || item.date || new Date().toISOString().split("T")[0]);
        const timeStart = item.ThoiGianBD ? item.ThoiGianBD.split("T")[1].substring(0, 5) : (item.TimeStart || item.GioBatDau || item.time_start || "07:30");
        const timeEnd = item.ThoiGianKT ? item.ThoiGianKT.split("T")[1].substring(0, 5) : (item.TimeEnd || item.GioKetThuc || item.time_end || "11:00");

        const rawId = item.ID || item.Id || item.id;
        const prefix = useMock ? "mock" : "lhu";
        const scheduleId = rawId ? `${prefix}-${studentId}-${rawId}` : `${prefix}-${studentId}-${idx}-${Date.now()}`;
        return {
          id: String(scheduleId),
          student_id: studentId,
          subject_name: item.TenMonHoc || item.SubjectName || item.TenMon || item.subject_name || "Môn học không tên",
          room: item.TenPhong || item.Room || item.Phong || item.room || "Tự do",
          teacher: item.GiaoVien || item.Teacher || item.teacher || "Chưa xếp giảng viên",
          date: dateStr,
          time_start: timeStart,
          time_end: timeEnd,
          lesson_nums: String(item.Tiet || item.lesson_nums || ""),
          class_name: item.TenNhom || item.ClassName || item.Lop || item.class_name || ""
        };
      });
    }
  } catch (err) {
    console.error(`[LHU Sync] Error calling LHU API:`, err.message);
    throw err;
  }

  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Get existing future schedules for this student from DB (today and future)
  const existingSchedules = db.prepare(`
    SELECT * FROM schedules 
    WHERE student_id = ? AND date >= ?
  `).all(studentId, todayStr);

  const existingMap = new Map(existingSchedules.map(s => [s.id, s]));
  const detectedChanges = [];

  // Get Zalo thread ID if user is linked, to prepare Zalo notifications
  const user = db.prepare("SELECT zalo_thread_id FROM users WHERE student_id = ?").get(studentId);
  const threadId = user ? user.zalo_thread_id : null;

  for (const s of scheduleList) {
    if (existingMap.has(s.id)) {
      const oldS = existingMap.get(s.id);
      existingMap.delete(s.id); // Remove from map so we know it's still present in the API

      // Compare details
      const diffs = [];
      if (oldS.room !== s.room) diffs.push(`Phòng học: ${oldS.room} ➜ ${s.room}`);
      if (oldS.teacher !== s.teacher) diffs.push(`Giảng viên: ${oldS.teacher} ➜ ${s.teacher}`);
      if (oldS.date !== s.date) diffs.push(`Ngày học: ${oldS.date} ➜ ${s.date}`);
      if (oldS.time_start !== s.time_start || oldS.time_end !== s.time_end) {
        diffs.push(`Giờ học: ${oldS.time_start}-${oldS.time_end} ➜ ${s.time_start}-${s.time_end}`);
      }

      if (diffs.length > 0) {
        detectedChanges.push({
          type: "MODIFIED",
          schedule: s,
          diffs: diffs
        });

        // Delete future pending notifications for this modified schedule to rebuild them later
        if (threadId) {
          db.prepare(`
            DELETE FROM queue_notifications 
            WHERE student_id = ? AND status = 'PENDING' AND message LIKE ?
          `).run(studentId, `%${s.subject_name}%`);
        }
      }
    } else {
      // Newly added schedule - no immediate notification needed as per user request
    }
  }

  // Any remaining schedules in existingMap are canceled/deleted in the API
  for (const [id, oldS] of existingMap.entries()) {
    detectedChanges.push({
      type: "CANCELED",
      schedule: oldS
    });

    // Delete future pending notifications for this canceled schedule
    if (threadId) {
      db.prepare(`
        DELETE FROM queue_notifications 
        WHERE student_id = ? AND status = 'PENDING' AND message LIKE ?
      `).run(studentId, `%${oldS.subject_name}%`);
    }

    // Delete the canceled schedule from DB
    db.prepare("DELETE FROM schedules WHERE id = ?").run(id);
  }

  // Insert/Update schedules in SQLite
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO schedules (id, student_id, subject_name, room, teacher, date, time_start, time_end, lesson_nums, class_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((list) => {
    for (const s of list) {
      insertStmt.run(
        s.id,
        s.student_id,
        s.subject_name,
        s.room,
        s.teacher,
        s.date,
        s.time_start,
        s.time_end,
        s.lesson_nums,
        s.class_name
      );
    }
  });

  transaction(scheduleList);
  console.log(`[LHU Sync] Successfully synchronized ${scheduleList.length} schedules for student ${studentId}.`);

  // Insert change notifications into queue_notifications if there's an active Zalo thread
  if (threadId && detectedChanges.length > 0) {
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
    const nowStr = formatLocalTime(new Date());

    const insertQueue = db.prepare(`
      INSERT INTO queue_notifications (student_id, zalo_thread_id, message, scheduled_time, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `);

    for (const c of detectedChanges) {
      let msg = "";
      if (c.type === "ADDED") {
        msg = `[LHU] Lịch học mới:\nMôn: '${c.schedule.subject_name}'\nNgày: ${c.schedule.date}\nGiờ: ${c.schedule.time_start} - ${c.schedule.time_end}\nPhòng: ${c.schedule.room}\nGV: ${c.schedule.teacher}`;
      } else if (c.type === "MODIFIED") {
        msg = `[LHU] Thay đổi lịch học:\nMôn: '${c.schedule.subject_name}' ngày ${c.schedule.date}\nChi tiết thay đổi:\n${c.diffs.map(d => `- ${d}`).join("\n")}`;
      } else if (c.type === "CANCELED") {
        msg = `[LHU] Hủy lịch học:\nMôn: '${c.schedule.subject_name}' ngày ${c.schedule.date} (Lớp: ${c.schedule.class_name || 'Chưa rõ'}) đã bị hủy.`;
      }

      if (msg) {
        insertQueue.run(studentId, threadId, msg, nowStr);
        console.log(`[LHU Sync] Queued instant change notification (${c.type}) for ${studentId}`);
      }
    }
  }

  return scheduleList;
}
