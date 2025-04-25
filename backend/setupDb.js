import sqlite3 from "sqlite3";
import { open } from "sqlite";
import dotenv from "dotenv";

dotenv.config();
const dbPath = process.env.SQLITE_DB_PATH || "./ai_adventure.db";

const setupSql = `
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,        
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_login_at TEXT DEFAULT (datetime('now'))
    );

    DROP TABLE IF EXISTS turns;
    DROP TABLE IF EXISTS sessions;

    CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- Added user_id FK
        theme TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        last_updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE turns (
        turn_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        turn_index INTEGER NOT NULL,
        scenario_text TEXT NOT NULL,
        image_url TEXT NOT NULL,
        image_prompt TEXT NOT NULL,
        suggested_actions TEXT NULL,
        action_taken TEXT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_turns_session_id_turn_index ON turns(session_id, turn_index);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_session_id_turn_index_unique ON turns(session_id, turn_index);
`;

async function setupDatabase() {
  console.log(`Setting up database at: ${dbPath}`);
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    console.log("Executing setup SQL...");
    await db.exec(setupSql);
    console.log("Database tables created successfully (if they didn't exist).");
  } catch (err) {
    console.error("Error setting up database:", err);
  } finally {
    await db.close();
    console.log("Database connection closed.");
  }
}

setupDatabase();
