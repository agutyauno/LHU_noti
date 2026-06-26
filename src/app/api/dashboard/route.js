import db from "@/db/index.js";
import { syncUserSchedule } from "@/services/lhuService.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");

    if (!studentId) {
      return Response.json({ error: "Thiếu student_id" }, { status: 400 });
    }

    // Get user
    const user = db.prepare("SELECT * FROM users WHERE student_id = ?").get(studentId);
    if (!user) {
      return Response.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
    }

    // Get schedules
    const schedules = db.prepare("SELECT * FROM schedules WHERE student_id = ? ORDER BY date ASC, time_start ASC").all(studentId);

    // Get pending notifications
    const notifications = db.prepare(`
      SELECT * FROM queue_notifications 
      WHERE student_id = ? 
      ORDER BY scheduled_time ASC
    `).all(studentId);

    const { password_hash, ...userInfo } = user;
    return Response.json({
      user: userInfo,
      schedules,
      notifications
    });
  } catch (error) {
    console.error("Dashboard GET error:", error);
    return Response.json({ error: "Lỗi hệ thống khi tải thông tin dashboard" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { action, student_id, receive_time_before_mins, receive_night_before } = await request.json();

    if (!student_id) {
      return Response.json({ error: "Thiếu student_id" }, { status: 400 });
    }

    if (action === "update_settings") {
      db.prepare(`
        UPDATE users 
        SET receive_time_before_mins = ?, receive_night_before = ?
        WHERE student_id = ?
      `).run(receive_time_before_mins, receive_night_before, student_id);

      const user = db.prepare("SELECT * FROM users WHERE student_id = ?").get(student_id);
      const { password_hash, ...userInfo } = user;

      return Response.json({ 
        message: "Cập nhật cấu hình thành công",
        user: userInfo
      });
    }

    if (action === "sync_schedule") {
      const schedules = await syncUserSchedule(student_id);
      return Response.json({ 
        message: "Đồng bộ lịch học thành công",
        schedules 
      });
    }

    return Response.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (error) {
    console.error("Dashboard POST error:", error);
    return Response.json({ error: "Lỗi hệ thống khi xử lý yêu cầu" }, { status: 500 });
  }
}
