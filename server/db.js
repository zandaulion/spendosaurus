import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const dbPath = path.join(DATA_DIR, 'spendosaurus.db');
export const db = new DatabaseSync(dbPath);

export const nowIso = () => new Date().toISOString();

export function initDb() {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id          TEXT PRIMARY KEY,
      token_hash  TEXT NOT NULL UNIQUE,
      label       TEXT,
      created_at  TEXT NOT NULL,
      last_seen   TEXT,
      revoked     INTEGER DEFAULT 0,
      has_push    INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash   TEXT NOT NULL UNIQUE,
      code        TEXT,
      label       TEXT,
      url         TEXT,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT,
      revoked     INTEGER DEFAULT 0,
      device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL,
      category          TEXT NOT NULL DEFAULT 'other',
      currency          TEXT NOT NULL DEFAULT 'RON',
      estimated_amount  REAL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'planned',
      target_date       TEXT,
      settled_date      TEXT,
      notes             TEXT,
      created_by_device TEXT REFERENCES devices(id) ON DELETE SET NULL,
      created_by_label  TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
    CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);

    CREATE TABLE IF NOT EXISTS item_costs (
      id            TEXT PRIMARY KEY,
      item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      amount        REAL NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'RON',
      note          TEXT,
      date          TEXT NOT NULL,
      device_id     TEXT REFERENCES devices(id) ON DELETE SET NULL,
      device_label  TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_item_costs_item ON item_costs(item_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id       TEXT,
      action        TEXT NOT NULL,
      summary       TEXT NOT NULL,
      details_json  TEXT,
      device_id     TEXT,
      device_label  TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_item ON audit_log(item_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);

  // Initialize default settings if not set
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setSetting.run('default_currency', 'RON');
  setSetting.run('threshold_ron', '500');
  setSetting.run('threshold_eur', '100');
  setSetting.run('exchange_rate_eur_ron', '5.0');
}

initDb();
