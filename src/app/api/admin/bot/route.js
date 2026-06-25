import db from "@/db/index.js";
import { checkAdminAuth } from "@/services/adminAuthService.js";

export async function GET() {
  try {
    if (!(await checkAdminAuth())) {
      return Response.json({ error: "Phiên làm việc hết hạn hoặc không có quyền truy cập" }, { status: 401 });
    }

    const session = db.prepare("SELECT * FROM zalo_sessions WHERE key = 'bot_session'").get();
    
    if (!session) {
      return Response.json({
        status: "DISCONNECTED",
        qr_code_data: null,
        error_message: null,
        is_online: false
      });
    }

    // Check heartbeat (is_online is true if updated_at is within last 35 seconds)
    // In SQLite, CURRENT_TIMESTAMP is in UTC. Let's verify heartbeat.
    // A simpler way: since node daemon updates heartbeat every 10 seconds,
    // let's check the time difference.
    const updatedAt = new Date(session.updated_at + " UTC").getTime();
    const now = Date.now();
    const timeDiffSeconds = (now - updatedAt) / 1000;
    
    // The daemon is online if it has updated the database recently (e.g. within 35 seconds)
    const isOnline = timeDiffSeconds < 35;

    return Response.json({
      status: session.status,
      qr_code_data: session.qr_code_data,
      error_message: session.error_message,
      is_online: isOnline,
      last_active: session.updated_at
    });
  } catch (error) {
    console.error("Admin bot GET error:", error);
    return Response.json({ error: "Lỗi hệ thống khi lấy trạng thái Bot" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await checkAdminAuth())) {
      return Response.json({ error: "Phiên làm việc hết hạn hoặc không có quyền truy cập" }, { status: 401 });
    }

    const { action } = await request.json();

    if (action === "reset_bot") {
      db.prepare(`
        INSERT OR REPLACE INTO zalo_sessions (key, status, cookie, imei, user_agent, qr_code_data, error_message)
        VALUES ('bot_session', 'DISCONNECTED', NULL, NULL, NULL, NULL, NULL)
      `).run();
      
      return Response.json({ message: "Đã reset phiên làm việc của Bot Zalo thành công" });
    }

    return Response.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (error) {
    console.error("Admin bot POST error:", error);
    return Response.json({ error: "Lỗi hệ thống khi xử lý yêu cầu Bot" }, { status: 500 });
  }
}
