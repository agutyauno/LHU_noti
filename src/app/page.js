"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-brand">
          <span>🔔</span> LHU Schedule Bot
        </div>
        <nav className="app-nav">
          <Link href="/auth" className="btn btn-secondary">
            Sinh viên
          </Link>
          <Link href="/admin" className="btn btn-primary">
            Quản trị viên
          </Link>
        </nav>
      </header>

      <main className="main-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", textAlign: "center" }}>
        <section style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 0" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", backgroundColor: "var(--accent-glow)", color: "var(--accent)", borderRadius: "var(--radius-full)", fontWeight: "600", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            ✨ Giải pháp đồng bộ thời khóa biểu tự động qua Zalo
          </div>

          <h1 className="hero-title" style={{ marginBottom: "1.5rem" }}>
            Không Bao Giờ Trễ Học Với Nhắc Lịch Zalo
          </h1>

          <p style={{ fontSize: "1.2rem", color: "var(--text-secondary)", marginBottom: "2.5rem", lineHeight: "1.6" }}>
            Hệ thống tự động đồng bộ thời khóa biểu từ trang LHU và gửi tin nhắn nhắc lịch học chi tiết trực tiếp vào Zalo cá nhân của bạn. Cài đặt thời gian nhắc nhở linh hoạt theo ý muốn.
          </p>

          <div className="hero-buttons">
            <Link href="/auth" className="btn btn-primary hero-btn">
              Bắt đầu đăng ký ngay ⚡
            </Link>
            <Link href="/admin" className="btn btn-secondary hero-btn">
              Bảng quản trị Bot Zalo
            </Link>
          </div>
        </section>

        <section className="grid-2" style={{ width: "100%", marginTop: "4rem", textAlign: "left" }}>
          <div className="card">
            <h3>🔄 Tự động đồng bộ</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Kết nối trực tiếp tới API lịch học LHU. Tự động cập nhật phòng học, giảng viên, thời gian khi có sự thay đổi.
            </p>
          </div>
          <div className="card">
            <h3>💬 Nhắc nhở Zalo cá nhân</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Tin nhắn tự động gửi đến Zalo cá nhân trước ca học (30 phút, 60 phút...) hoặc vào tối ngày hôm trước lúc 20:00.
            </p>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <p>© 2026 LHU Schedule Notification App. Powered by Next.js & zca-js.</p>
      </footer>
    </div>
  );
}
