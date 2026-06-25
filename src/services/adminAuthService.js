import { cookies } from "next/headers";
import db from "@/db/index.js";
import crypto from "crypto";

/**
 * Creates a new admin session, saves it in SQLite, and sets a secure HttpOnly cookie.
 */
export async function createAdminSession() {
  // Clean up expired sessions first to keep database clean
  try {
    db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(Date.now());
  } catch (e) {
    console.error("Failed to clean up expired sessions:", e);
  }

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 1 day
  
  // Save to DB
  db.prepare(`
    INSERT INTO admin_sessions (token, expires_at)
    VALUES (?, ?)
  `).run(token, expiresAt);
  
  // Set Cookie
  const cookieStore = await cookies();
  cookieStore.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 // 1 day in seconds
  });
  
  return token;
}

/**
 * Verifies if the admin session cookie is valid and present in SQLite.
 */
export async function checkAdminAuth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_session")?.value;
    if (!token) return false;
    
    const now = Date.now();
    const session = db.prepare(`
      SELECT * FROM admin_sessions
      WHERE token = ? AND expires_at > ?
    `).get(token, now);
    
    return !!session;
  } catch (err) {
    console.error("Admin auth check error:", err);
    return false;
  }
}

/**
 * Deletes the admin session from both SQLite and clear the cookie.
 */
export async function deleteAdminSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_session")?.value;
    
    // Clear cookie
    cookieStore.delete("admin_session");
    
    if (token) {
      db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    }
    return true;
  } catch (err) {
    console.error("Admin session deletion error:", err);
    return false;
  }
}
