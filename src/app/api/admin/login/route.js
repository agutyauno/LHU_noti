import { createAdminSession } from "@/services/adminAuthService.js";

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    
    const expectedUsername = process.env.ADMIN_USERNAME || "admin";
    const expectedPassword = process.env.ADMIN_PASSWORD || "admin";
    
    if (username === expectedUsername && password === expectedPassword) {
      await createAdminSession();
      return Response.json({ success: true, message: "Đăng nhập quản trị viên thành công" });
    }
    
    return Response.json(
      { error: "Tên đăng nhập hoặc mật khẩu quản trị viên không chính xác" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Admin login API error:", error);
    return Response.json(
      { error: "Lỗi hệ thống khi đăng nhập quản trị viên" },
      { status: 500 }
    );
  }
}
