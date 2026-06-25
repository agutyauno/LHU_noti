"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Settings states
  const [phone, setPhone] = useState("");
  const [receiveTimeBefore, setReceiveTimeBefore] = useState(60);
  const [receiveNightBefore, setReceiveNightBefore] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async (studentId) => {
    try {
      const response = await fetch(`/api/dashboard?student_id=${studentId}`);
      if (!response.ok) throw new Error("Không thể tải thông tin");
      const data = await response.json();
      
      setUser(data.user);
      setSchedules(data.schedules);
      setNotifications(data.notifications);
      
      setPhone(data.user.phone || "");
      setReceiveTimeBefore(data.user.receive_time_before_mins);
      setReceiveNightBefore(data.user.receive_night_before);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cachedUser = localStorage.getItem("lhu_user");
    if (!cachedUser) {
      router.push("/auth");
      return;
    }
    const parsed = JSON.parse(cachedUser);
    loadData(parsed.student_id);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("lhu_user");
    router.push("/auth");
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          student_id: user.student_id,
          receive_time_before_mins: parseInt(receiveTimeBefore),
          receive_night_before: parseInt(receiveNightBefore),
          phone
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lỗi lưu cấu hình");

      setUser(data.user);
      // Update local storage representation
      localStorage.setItem("lhu_user", JSON.stringify(data.user));
      setMessage("Cấu hình cài đặt đã được cập nhật thành công.");
      
      // Reload queue to see if schedules scheduled_time updated
      loadData(user.student_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_schedule",
          student_id: user.student_id
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lỗi đồng bộ");

      setSchedules(data.schedules);
      setMessage("Thời khóa biểu LHU đã được đồng bộ về hệ thống.");
      
      // Reload details to update notifications queue list
      loadData(user.student_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
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
          <span>🔔</span> LHU Schedule Bot
        </Link>
        <div className="app-nav">
          <span style={{ fontWeight: "600", color: "var(--text-secondary)" }}>Xin chào, {user?.fullname}</span>
          <button onClick={handleLogout} className="btn btn-secondary">
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="main-content">
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

        <div className="grid-2">
          {/* Zalo Link Connection Status */}
          <div className="card">
            <h2>Kết Nối Zalo</h2>
            {user?.zalo_thread_id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="badge badge-success">Đã Liên Kết</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Thread ID: {user.zalo_thread_id}</span>
                </div>
                <p style={{ color: "var(--text-secondary)" }}>
                  Tài khoản của bạn đã được kết nối với Zalo Bot. Bạn sẽ nhận được các thông báo nhắc lịch học tự động theo cấu hình bên cạnh.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="badge badge-warning">Chưa Liên Kết Zalo</span>
                </div>
                <div style={{ backgroundColor: "var(--bg-tertiary)", padding: "1rem", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--warning)" }}>
                  <p style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.5rem" }}>👉 Hướng dẫn liên kết Zalo nhanh:</p>
                  <ol style={{ paddingLeft: "1.25rem", fontSize: "0.9rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <li>Quét mã QR Zalo Bot ở trang Admin hoặc kết bạn với số điện thoại của Bot Zalo.</li>
                    <li>Gửi tin nhắn chính xác cú pháp sau tới Zalo Bot:</li>
                  </ol>
                  <div style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginTop: "0.75rem", textAlign: "center", fontWeight: "800", letterSpacing: "0.05em", color: "var(--accent)", fontSize: "1.1rem" }}>
                    DK {user?.student_id}
                  </div>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-tertiary)" }}>
                  Sau khi nhắn tin, Bot sẽ tự động chấp nhận kết bạn, liên kết tài khoản và trả lời xác nhận thành công.
                </p>
              </div>
            )}
          </div>

          {/* User Settings Form */}
          <div className="card">
            <h2>Cấu Hình Nhắc Lịch</h2>
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label className="form-label">Số điện thoại Zalo (Tùy chọn)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  placeholder="09xxxxxxxx"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Thời gian nhắc trước khi học (Phút)</label>
                <select 
                  className="form-control" 
                  value={receiveTimeBefore} 
                  onChange={(e) => setReceiveTimeBefore(e.target.value)}
                >
                  <option value={15}>Trước 15 phút</option>
                  <option value={30}>Trước 30 phút</option>
                  <option value={45}>Trước 450 phút</option>
                  <option value={60}>Trước 1 tiếng (Khuyên dùng)</option>
                  <option value={120}>Trước 2 tiếng</option>
                </select>
              </div>

              <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", marginTop: "1rem", marginBottom: "1.5rem" }}>
                <input 
                  type="checkbox" 
                  id="nightBefore" 
                  checked={receiveNightBefore === 1} 
                  onChange={(e) => setReceiveNightBefore(e.target.checked ? 1 : 0)} 
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <label htmlFor="nightBefore" style={{ fontSize: "0.95rem", fontWeight: "600", cursor: "pointer", color: "var(--text-secondary)" }}>
                  Gửi thông báo nhắc nhở vào tối hôm trước (lúc 20:00)
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu Cấu Hình"}
              </button>
            </form>
          </div>
        </div>

        {/* LHU Schedules Table Card */}
        <div className="card" style={{ marginTop: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2>Thời Khóa Biểu Đồng Bộ</h2>
            <button onClick={handleSyncNow} className="btn btn-secondary" disabled={syncing}>
              {syncing ? "Đang đồng bộ..." : "🔄 Đồng Bộ Ngay"}
            </button>
          </div>
          
          {schedules.length > 0 ? (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Ngày Học</th>
                    <th>Thời Gian</th>
                    <th>Tên Môn Học</th>
                    <th>Phòng</th>
                    <th>Tiết</th>
                    <th>Lớp</th>
                    <th>Giảng Viên</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: "600" }}>{s.date}</td>
                      <td style={{ color: "var(--accent)", fontWeight: "600" }}>{s.time_start} - {s.time_end}</td>
                      <td>{s.subject_name}</td>
                      <td style={{ fontWeight: "600" }}>{s.room}</td>
                      <td>{s.lesson_nums}</td>
                      <td>{s.class_name}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{s.teacher}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-tertiary)" }}>
              Chưa có dữ liệu lịch học được đồng bộ. Bấm nút "Đồng Bộ Ngay" để lấy lịch từ LHU.
            </div>
          )}
        </div>

        {/* Active Notifications Queue Card */}
        <div className="card" style={{ marginTop: "2rem" }}>
          <h2>Hàng Đợi Thông Báo Zalo</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1rem" }}>
            Các thông báo đã được lên lịch dựa trên thời khóa biểu và cài đặt của bạn.
          </p>

          {notifications.length > 0 ? (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Thời Gian Gửi Dự Kiến</th>
                    <th>Nội Dung Tin Nhắn</th>
                    <th>Trạng Thái</th>
                    <th>Chi Tiết Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{n.scheduled_time}</td>
                      <td style={{ fontSize: "0.9rem", maxWidth: "400px" }}>{n.message}</td>
                      <td>
                        <span className={`badge ${
                          n.status === 'SENT' ? 'badge-success' : 
                          n.status === 'PENDING' ? 'badge-warning' : 'badge-danger'
                        }`}>
                          {n.status}
                        </span>
                      </td>
                      <td style={{ color: "var(--error)", fontSize: "0.85rem" }}>{n.error_message || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-tertiary)" }}>
              Không có thông báo nào trong hàng đợi. Đồng bộ thời khóa biểu để tự động lên lịch nhắc nhở.
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>© 2026 LHU Schedule Notification App.</p>
      </footer>
    </div>
  );
}
