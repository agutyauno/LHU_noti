import db from "@/db/index.js";
import bcrypt from "bcryptjs";

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json(
        { error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu" },
        { status: 400 }
      );
    }

    // Find user
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) {
      return Response.json(
        { error: "Sai tên đăng nhập hoặc mật khẩu" },
        { status: 400 }
      );
    }

    // Compare password
    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return Response.json(
        { error: "Sai tên đăng nhập hoặc mật khẩu" },
        { status: 400 }
      );
    }

    // Return user info (exclude password_hash)
    const { password_hash, ...userInfo } = user;
    return Response.json({ user: userInfo });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json(
      { error: "Lỗi hệ thống khi đăng nhập" },
      { status: 500 }
    );
  }
}
