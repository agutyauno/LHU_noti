import db from "@/db/index.js";
import bcrypt from "bcryptjs";

export async function POST(request) {
  try {
    const { username, password, student_id, fullname } = await request.json();

    if (!username || !password || !student_id || !fullname) {
      return Response.json(
        { error: "Vui lòng nhập đầy đủ thông tin" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = db.prepare("SELECT * FROM users WHERE username = ? OR student_id = ?").get(username, student_id);
    if (existingUser) {
      return Response.json(
        { error: "Tên đăng nhập hoặc Mã số sinh viên đã tồn tại" },
        { status: 400 }
      );
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // Insert user
    db.prepare(`
      INSERT INTO users (username, password_hash, student_id, fullname)
      VALUES (?, ?, ?, ?)
    `).run(username, passwordHash, student_id, fullname);

    return Response.json({ message: "Đăng ký tài khoản thành công" });
  } catch (error) {
    console.error("Registration error:", error);
    return Response.json(
      { error: "Lỗi máy chủ trong quá trình đăng ký" },
      { status: 500 }
    );
  }
}
