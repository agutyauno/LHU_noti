import db from "../db/index.js";

/**
 * Fetches the user schedule from LHU API (or returns mock data if not configured)
 * and upserts it into the SQLite schedules table.
 */
export async function syncUserSchedule(studentId) {
  const apiUrl = process.env.LHU_API_URL;
  const apiKey = process.env.LHU_API_KEY;

  let scheduleList = [];

  if (!apiUrl) {
    // Return mock data for testing
    console.log(`[LHU Sync] No LHU_API_URL configured. Generating mock schedules for student: ${studentId}`);
    scheduleList = generateMockSchedules(studentId);
  } else {
    try {
      const today = new Date().toISOString();
      const payload = {
        StudentID: studentId,
        Ngay: today,
        PageIndex: 1,
        PageSize: 100
      };

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
        scheduleList = rawData.map((item, idx) => ({
          id: String(item.Id || item.ID || item.id || `lhu-${studentId}-${idx}-${Date.now()}`),
          student_id: studentId,
          subject_name: item.SubjectName || item.TenMon || item.subject_name || "Môn học không tên",
          room: item.Room || item.Phong || item.room || "Tự do",
          teacher: item.Teacher || item.GiaoVien || item.teacher || "Chưa xếp giảng viên",
          date: item.Date || item.Ngay || item.date || new Date().toISOString().split("T")[0],
          time_start: item.TimeStart || item.GioBatDau || item.time_start || "07:30",
          time_end: item.TimeEnd || item.GioKetThuc || item.time_end || "11:00",
          lesson_nums: String(item.Tiet || item.lesson_nums || ""),
          class_name: item.ClassName || item.Lop || item.class_name || ""
        }));
      }
    } catch (err) {
      console.error(`[LHU Sync] Error calling real LHU API, falling back to mock:`, err.message);
      scheduleList = generateMockSchedules(studentId);
    }
  }

  // Upsert into schedules SQLite table
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
  return scheduleList;
}

/**
 * Generates test schedules relative to the current local date and time.
 * One schedule in 20 minutes (for prompt notification testing) and one tomorrow.
 */
function generateMockSchedules(studentId) {
  const today = new Date();

  // Format dates: YYYY-MM-DD
  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  // Schedule 1: Today, starting in 20 minutes
  const class1Time = new Date(today.getTime() + 20 * 60 * 1000);
  const timeStart1 = `${String(class1Time.getHours()).padStart(2, '0')}:${String(class1Time.getMinutes()).padStart(2, '0')}`;
  const end1Time = new Date(class1Time.getTime() + 90 * 60 * 1000); // 1.5h class
  const timeEnd1 = `${String(end1Time.getHours()).padStart(2, '0')}:${String(end1Time.getMinutes()).padStart(2, '0')}`;

  // Schedule 2: Tomorrow morning at 07:30
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  return [
    {
      id: `mock-1-${formatDate(today)}-${studentId}`,
      student_id: studentId,
      subject_name: "Lập trình Web nâng cao",
      room: "I.304",
      teacher: "ThS. Nguyễn Văn A",
      date: formatDate(today),
      time_start: timeStart1,
      time_end: timeEnd1,
      lesson_nums: "1 - 3",
      class_name: "22DTH1"
    },
    {
      id: `mock-2-${formatDate(tomorrow)}-${studentId}`,
      student_id: studentId,
      subject_name: "Trí tuệ nhân tạo",
      room: "I.202",
      teacher: "TS. Lê Hoàng B",
      date: formatDate(tomorrow),
      time_start: "07:30",
      time_end: "11:00",
      lesson_nums: "1 - 4",
      class_name: "22DTH2"
    },
    {
      id: `mock-3-${formatDate(tomorrow)}-${studentId}`,
      student_id: studentId,
      subject_name: "Đồ họa máy tính",
      room: "I.202",
      teacher: "ThS. Hoàng Thị C",
      date: formatDate(tomorrow),
      time_start: "16:15",
      time_end: "18:50",
      lesson_nums: "11 - 15",
      class_name: "22DTH1"
    }
  ];
}
