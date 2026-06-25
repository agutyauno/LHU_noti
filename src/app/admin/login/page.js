"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Tên đăng nhập hoặc mật khẩu không chính xác");
      }

      setSuccess("Đăng nhập quản trị viên thành công! Đang chuyển hướng...");
      setTimeout(() => {
        router.push("/admin");
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <Link href="/" className="app-brand">
          <span>🔔</span> LHU Schedule Bot
        </Link>
        <Link href="/" className="btn btn-secondary">
          Quay lại trang chủ
        </Link>
      </header>

      <main className="main-content" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "75vh" }}>
        <div className="card" style={{ width: "100%", maxWidth: "450px", padding: "2.5rem 2rem" }}>
          <h2 style={{ textAlign: "center", marginBottom: "0.5rem", background: "linear-gradient(135deg, var(--text-primary) 30%, var(--accent) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Quản Trị Hệ Thống
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "2rem" }}>
            Vui lòng nhập thông tin xác thực quản trị viên để tiếp tục vào bảng điều khiển.
          </p>

          {error && (
            <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--error-glow)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius-sm)", color: "var(--error)", marginBottom: "1.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--success-glow)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "var(--radius-sm)", color: "var(--success)", marginBottom: "1.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
              ✅ {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Tài khoản Admin</label>
              <input 
                type="text" 
                className="form-control" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin" 
                required 
              />
            </div>

            <div className="form-group" style={{ marginBottom: "2rem" }}>
              <label className="form-label">Mật khẩu</label>
              <input 
                type="password" 
                className="form-control" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                required 
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? <div className="loading-spinner"></div> : "Đăng Nhập"}
            </button>
          </form>
        </div>
      </main>

      <footer className="app-footer">
        <p>© 2026 LHU Schedule Notification App. Admin portal.</p>
      </footer>
    </div>
  );
}
