-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    student_id TEXT UNIQUE NOT NULL, -- MSSV/MSCB
    fullname TEXT,
    phone TEXT,
    zalo_thread_id TEXT,
    receive_time_before_mins INTEGER DEFAULT 60, -- Remind 60 mins before class
    receive_night_before INTEGER DEFAULT 1, -- 1 = Yes, 0 = No
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create schedules table
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY, -- Composite key or LHU event ID
    student_id TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    room TEXT,
    teacher TEXT,
    date TEXT NOT NULL, -- YYYY-MM-DD
    time_start TEXT NOT NULL, -- HH:MM
    time_end TEXT NOT NULL, -- HH:MM
    lesson_nums TEXT, -- e.g. "1 - 3"
    class_name TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create zalo_sessions table to manage Zalo Bot connection
CREATE TABLE IF NOT EXISTS zalo_sessions (
    key TEXT PRIMARY KEY, -- 'bot_session'
    cookie TEXT, -- JSON cookie string
    imei TEXT,
    user_agent TEXT,
    qr_code_data TEXT, -- Base64 string of QR code
    status TEXT DEFAULT 'DISCONNECTED', -- 'DISCONNECTED', 'QR_READY', 'CONNECTED'
    error_message TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create queue_notifications table for scheduled notifications
CREATE TABLE IF NOT EXISTS queue_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    zalo_thread_id TEXT NOT NULL,
    message TEXT NOT NULL,
    scheduled_time DATETIME NOT NULL, -- YYYY-MM-DD HH:MM:SS
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME
);

-- Index for querying schedules by student and date
CREATE INDEX IF NOT EXISTS idx_schedules_student_date ON schedules(student_id, date);

-- Index for scanning notification queue
CREATE INDEX IF NOT EXISTS idx_queue_pending ON queue_notifications(status, scheduled_time);

-- Create admin_sessions table to manage admin logins
CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL, -- Unix timestamp in milliseconds
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

