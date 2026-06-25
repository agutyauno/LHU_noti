import { deleteAdminSession } from "@/services/adminAuthService.js";

export async function POST() {
  try {
    await deleteAdminSession();
    return Response.json({ success: true, message: "Đăng xuất quản trị viên thành công" });
  } catch (error) {
    console.error("Admin logout API error:", error);
    return Response.json(
      { error: "Lỗi hệ thống khi đăng xuất" },
      { status: 500 }
    );
  }
}
