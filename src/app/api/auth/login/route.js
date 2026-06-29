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

    const normalizedUsername = username.trim().toLowerCase();

    // Find user
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(normalizedUsername);
    if (!user) {
      return Response.json(
        { error: "Sai tên đăng nhập hoặc mật khẩu" },
        { status: 400 }
      );
    }

    // Compare password
    let isMatch = false;
    try {
      isMatch = bcrypt.compareSync(password, user.password_hash);
    } catch (e) {
      console.error("[Login] Bcrypt verification error (possible malformed hash):", e.message);
    }

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
