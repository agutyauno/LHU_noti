import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Determine the path of the database file
// Since Next.js and the daemon might run from different directories, use absolute paths
const DB_PATH = path.resolve(process.cwd(), "database.sqlite");
const SCHEMA_PATH = path.resolve(process.cwd(), "src/db/schema.sql");

// Initialize database
let db;
try {
  db = new Database(DB_PATH, { verbose: null });
  // Enable WAL mode for better concurrency between Next.js and Zalo Daemon
  db.pragma("journal_mode = WAL");
  
  // Run schema setup
  if (fs.existsSync(SCHEMA_PATH)) {
    const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");
    db.exec(schemaSql);
  }
} catch (error) {
  console.error("Failed to initialize SQLite Database:", error);
}

export default db;
export { DB_PATH };
