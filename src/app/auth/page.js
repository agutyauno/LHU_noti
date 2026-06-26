"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthPage() {
  const router = useRouter();
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullname, setFullname] = useState("");
  const [studentId, setStudentId] = useState("");

  useEffect(() => {
    // If user already logged in, redirect to dashboard
    const user = localStorage.getItem("lhu_user");
    if (user) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const endpoint = isLoginTab ? "/api/auth/login" : "/api/auth/register";
    const payload = isLoginTab 
      ? { username, password } 
      : { username, password, student_id: studentId, fullname };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra");
      }

      if (isLoginTab) {
        localStorage.setItem("lhu_user", JSON.stringify(data.user));
        setSuccess("Đăng nhập thành công! Đang chuyển hướng...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 1000);
      } else {
        setSuccess("Đăng ký thành công! Hãy đăng nhập bằng tài khoản mới.");
        setIsLoginTab(true);
        // Clear fields
        setUsername("");
        setPassword("");
        setFullname("");
        setStudentId("");
      }
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
          <span>🔔</span> LHU Bot <span className="brand-subtext">Schedule</span>
        </Link>
        <Link href="/" className="btn btn-secondary nav-btn" title="Quay lại trang chủ">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="nav-btn-text">Quay lại trang chủ</span>
        </Link>
      </header>

      <main className="main-content" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "75vh" }}>
        <div className="card" style={{ width: "100%", maxWidth: "450px", padding: "2.5rem 2rem" }}>
          <div style={{ display: "flex", borderBottom: "2px solid var(--border)", marginBottom: "2rem" }}>
            <button 
              onClick={() => { setIsLoginTab(true); setError(""); setSuccess(""); }}
              style={{ flex: 1, padding: "1rem", background: "none", border: "none", color: isLoginTab ? "var(--accent)" : "var(--text-secondary)", borderBottom: isLoginTab ? "2px solid var(--accent)" : "none", fontWeight: "700", cursor: "pointer", transition: "var(--transition)" }}
            >
              ĐĂNG NHẬP
            </button>
            <button 
              onClick={() => { setIsLoginTab(false); setError(""); setSuccess(""); }}
              style={{ flex: 1, padding: "1rem", background: "none", border: "none", color: !isLoginTab ? "var(--accent)" : "var(--text-secondary)", borderBottom: !isLoginTab ? "2px solid var(--accent)" : "none", fontWeight: "700", cursor: "pointer", transition: "var(--transition)" }}
            >
              ĐĂNG KÝ
            </button>
          </div>

          <h2 style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            {isLoginTab ? "Đăng Nhập Sinh Viên" : "Đăng Ký Tài Khoản"}
          </h2>

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
            {!isLoginTab && (
              <>
                <div className="form-group">
                  <label className="form-label">Họ và Tên</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={fullname}
                    onChange={(e) => setFullname(e.target.value)}
                    placeholder="Nguyễn Văn A" 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mã số sinh viên (MSSV)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="123000784" 
                    required 
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Tên đăng nhập</label>
              <input 
                type="text" 
                className="form-control" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nva_student" 
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
              {loading ? <div className="loading-spinner"></div> : (isLoginTab ? "Đăng Nhập" : "Đăng Ký")}
            </button>
          </form>
        </div>
      </main>

      <footer className="app-footer">
        <p>© 2026 LHU Schedule Notification App.</p>
      </footer>
    </div>
  );
}
