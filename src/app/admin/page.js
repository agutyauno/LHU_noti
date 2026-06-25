"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminPage() {
  const router = useRouter();
  const [botState, setBotState] = useState({
    status: "DISCONNECTED",
    qr_code_data: null,
    error_message: null,
    is_online: false,
    last_active: null
  });
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    total_users: 0,
    linked_users: 0,
    sent_messages: 0,
    failed_messages: 0
  });

  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchBotStatus = async () => {
    try {
      const res = await fetch("/api/admin/bot");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setBotState(data);
      }
    } catch (err) {
      console.error("Failed to fetch bot status:", err);
    }
  };

  const fetchUsersAndStats = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch users and stats:", err);
    }
  };

  useEffect(() => {
    // Initial fetch
    Promise.all([fetchBotStatus(), fetchUsersAndStats()]).finally(() => {
      setLoading(false);
    });

    // Poll bot status every 3 seconds for QR updates and connection updates
    const botInterval = setInterval(fetchBotStatus, 3000);
    // Poll user lists/stats every 5 seconds
    const userInterval = setInterval(fetchUsersAndStats, 5000);

    return () => {
      clearInterval(botInterval);
      clearInterval(userInterval);
    };
  }, []);

  const handleResetBot = async () => {
    if (!confirm("Bạn có chắc chắn muốn reset phiên làm việc của Bot? Hành động này sẽ đăng xuất Bot khỏi tài khoản Zalo hiện tại.")) {
      return;
    }

    setResetting(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/admin/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_bot" })
      });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể reset bot");

      setMessage("Đã gửi yêu cầu đăng xuất bot. Trạng thái sẽ cập nhật trong giây lát.");
      fetchBotStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/admin/logout", { method: "POST" });
      if (res.ok) {
        router.push("/admin/login");
      } else {
        setError("Không thể đăng xuất. Vui lòng thử lại.");
      }
    } catch (err) {
      console.error("Logout error:", err);
      setError("Có lỗi xảy ra khi đăng xuất.");
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="loading-spinner" style={{ borderTopColor: "var(--accent)", width: "40px", height: "40px" }}></div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <Link href="/" className="app-brand">
          <span>🔔</span> LHU Bot Admin Control
        </Link>
        <div className="app-nav" style={{ display: "flex", gap: "1rem" }}>
          <button onClick={handleLogout} className="btn btn-secondary">
            Đăng xuất
          </button>
          <Link href="/" className="btn btn-secondary">
            Quay lại trang chủ
          </Link>
        </div>
      </header>

      <main className="main-content">
        <h1 style={{ marginBottom: "2rem" }}>Trang Quản Trị Hệ Thống</h1>

        {message && (
          <div style={{ padding: "1rem", backgroundColor: "var(--success-glow)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "var(--radius-md)", color: "var(--success)", marginBottom: "1.5rem", fontWeight: "500" }}>
            ✅ {message}
          </div>
        )}

        {error && (
          <div style={{ padding: "1rem", backgroundColor: "var(--error-glow)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius-md)", color: "var(--error)", marginBottom: "1.5rem", fontWeight: "500" }}>
            ⚠️ {error}
          </div>
        )}

        {/* Stats Grid */}
        <section className="grid-2" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "2rem" }}>
          <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ fontSize: "2rem", margin: "0.25rem 0", color: "var(--accent)" }}>{stats.total_users}</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: "600" }}>Tổng tài khoản</p>
          </div>
          <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ fontSize: "2rem", margin: "0.25rem 0", color: "var(--success)" }}>{stats.linked_users}</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: "600" }}>Đã kết nối Zalo</p>
          </div>
          <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ fontSize: "2rem", margin: "0.25rem 0", color: "var(--accent-hover)" }}>{stats.sent_messages}</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: "600" }}>Tin nhắn đã gửi</p>
          </div>
          <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ fontSize: "2rem", margin: "0.25rem 0", color: "var(--error)" }}>{stats.failed_messages}</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: "600" }}>Tin nhắn lỗi</p>
          </div>
        </section>

        <div className="grid-2">
          {/* Zalo Bot Status and Connection Panel */}
          <div className="card">
            <h2>Trạng Thái Zalo Bot</h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
                <span style={{ fontWeight: "600" }}>Tiến trình ngầm (Daemon):</span>
                <span className={`badge ${botState.is_online ? "badge-success" : "badge-danger"}`}>
                  {botState.is_online ? "ONLINE" : "OFFLINE"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
                <span style={{ fontWeight: "600" }}>Kết nối Zalo:</span>
                <span className={`badge ${
                  botState.status === "CONNECTED" ? "badge-success" : 
                  botState.status.startsWith("QR") ? "badge-warning" : "badge-danger"
                }`}>
                  {botState.status}
                </span>
              </div>

              {botState.error_message && (
                <div style={{ padding: "0.75rem", backgroundColor: "var(--error-glow)", borderRadius: "var(--radius-sm)", color: "var(--error)", fontSize: "0.9rem" }}>
                  <strong>Lỗi:</strong> {botState.error_message}
                </div>
              )}

              {/* Bot QR Code display */}
              {botState.status === "QR_READY" && botState.qr_code_data && (
                <div className="qr-container">
                  <p style={{ fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.75rem", textAlign: "center" }}>
                    Quét mã QR bằng ứng dụng Zalo trên điện thoại để đăng nhập Bot:
                  </p>
                  <div className="qr-image">
                    {/* The image is a Base64 string data URL */}
                    <img 
                      src={botState.qr_code_data.startsWith("data:") ? botState.qr_code_data : `data:image/png;base64,${botState.qr_code_data}`} 
                      alt="Zalo Bot Login QR Code" 
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "0.75rem" }}>
                    Mã QR tự động cập nhật.
                  </p>
                </div>
              )}

              {botState.status === "QR_SCANNED" && (
                <div className="qr-container" style={{ borderStyle: "solid" }}>
                  <div className="pulse" style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--warning)", textAlign: "center" }}>
                    📱 Mã QR Đã Quét!
                  </div>
                  <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.5rem", textAlign: "center" }}>
                    Vui lòng bấm <strong>Xác nhận/Cho phép đăng nhập</strong> trên điện thoại của bạn.
                  </p>
                </div>
              )}

              {botState.status === "CONNECTED" && (
                <div style={{ backgroundColor: "var(--success-glow)", padding: "1rem", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--success)", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                  🎉 <strong>Bot Zalo hoạt động bình thường!</strong>
                  <br />
                  Sẵn sàng tiếp nhận tin nhắn kết bạn và tự động nhắn tin nhắc lịch.
                </div>
              )}

              {!botState.is_online && (
                <div style={{ backgroundColor: "var(--error-glow)", padding: "1rem", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--error)", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                  ⚠️ <strong>Cảnh báo:</strong> Zalo Bot Daemon đang OFFLINE. Hãy chạy lệnh khởi động daemon ngầm trên máy chủ để kích hoạt gửi tin.
                </div>
              )}

              {/* Bot Control Actions */}
              <div style={{ marginTop: "1rem" }}>
                <button 
                  onClick={handleResetBot} 
                  className="btn btn-danger" 
                  style={{ width: "100%" }} 
                  disabled={resetting || !botState.is_online}
                >
                  {resetting ? "Đang xử lý..." : "Reset Phiên Làm Việc Bot (Đăng xuất)"}
                </button>
              </div>
            </div>
          </div>

          {/* User List Panel */}
          <div className="card" style={{ flex: 1.5 }}>
            <h2>Danh Sách Người Dùng Đăng Ký</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              Danh sách sinh viên, giảng viên đã đăng ký tài khoản trên hệ thống Web.
            </p>

            {users.length > 0 ? (
              <div className="table-container" style={{ maxHeight: "400px", overflowY: "auto" }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Họ và Tên</th>
                      <th>MSSV/MSCB</th>
                      <th>Tài khoản</th>
                      <th>Zalo Thread ID</th>
                      <th>Số điện thoại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: "600" }}>{u.fullname}</td>
                        <td style={{ fontWeight: "600" }}>{u.student_id}</td>
                        <td>{u.username}</td>
                        <td>
                          {u.zalo_thread_id ? (
                            <span className="badge badge-success" style={{ textTransform: "none", letterSpacing: "normal" }}>
                              {u.zalo_thread_id.substring(0, 12)}...
                            </span>
                          ) : (
                            <span className="badge badge-warning">Chưa kết nối</span>
                          )}
                        </td>
                        <td>{u.phone || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-tertiary)" }}>
                Chưa có tài khoản sinh viên/giảng viên nào đăng ký.
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>© 2026 LHU Schedule Notification App. Admin dashboard.</p>
      </footer>
    </div>
  );
}
