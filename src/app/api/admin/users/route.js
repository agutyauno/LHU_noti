import db from "@/db/index.js";
import { checkAdminAuth } from "@/services/adminAuthService.js";

export async function GET() {
  try {
    if (!(await checkAdminAuth())) {
      return Response.json({ error: "Phiên làm việc hết hạn hoặc không có quyền truy cập" }, { status: 401 });
    }

    // Fetch all users and order by registration time
    const users = db.prepare(`
      SELECT id, username, student_id, fullname, phone, zalo_thread_id, created_at 
      FROM users 
      ORDER BY created_at DESC
    `).all();

    // Fetch message stats
    const stats = db.prepare(`
      SELECT 
        (SELECT count(*) FROM users) as total_users,
        (SELECT count(*) FROM users WHERE zalo_thread_id IS NOT NULL) as linked_users,
        (SELECT count(*) FROM queue_notifications WHERE status = 'SENT') as sent_messages,
        (SELECT count(*) FROM queue_notifications WHERE status = 'FAILED') as failed_messages
      FROM zalo_sessions LIMIT 1
    `).get() || { total_users: users.length, linked_users: 0, sent_messages: 0, failed_messages: 0 };

    return Response.json({ users, stats });
  } catch (error) {
    console.error("Admin users GET error:", error);
    return Response.json({ error: "Lỗi hệ thống khi lấy danh sách người dùng" }, { status: 500 });
  }
}
