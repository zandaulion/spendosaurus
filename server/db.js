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
      estimated_minor   INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'planned',
      target_date       TEXT,
      settled_date      TEXT,
      notes             TEXT,
      recurrence        TEXT DEFAULT NULL,
      current_cycle     TEXT DEFAULT NULL,
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
      amount_minor  INTEGER NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'RON',
      note          TEXT,
      date          TEXT NOT NULL,
      cycle         TEXT DEFAULT NULL,
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

  // Safe schema migrations for existing databases
  try { db.exec("ALTER TABLE items ADD COLUMN recurrence TEXT DEFAULT NULL;"); } catch {}
  try { db.exec("ALTER TABLE items ADD COLUMN current_cycle TEXT DEFAULT NULL;"); } catch {}
  try { db.exec("ALTER TABLE item_costs ADD COLUMN cycle TEXT DEFAULT NULL;"); } catch {}

  migrateMoneyToMinorUnits();

  // Safe data migration for yearly items to 12-month anniversary format (e.g. "2026" -> "2026-09")
  try {
    const yearlyItems = db.prepare("SELECT id, current_cycle, created_at, target_date FROM items WHERE recurrence = 'yearly' AND current_cycle IS NOT NULL").all();
    for (const yIt of yearlyItems) {
      if (yIt.current_cycle && !yIt.current_cycle.includes('-')) {
        const dStr = yIt.target_date || yIt.created_at || '2026-09';
        const m = dStr.slice(5, 7) || '01';
        db.prepare("UPDATE items SET current_cycle = ? WHERE id = ?").run(`${yIt.current_cycle}-${m}`, yIt.id);
      }
    }
  } catch {}

  // Initialize default settings if not set
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setSetting.run('default_currency', 'RON');
  setSetting.run('threshold_ron', '500');
  setSetting.run('threshold_eur', '100');
  setSetting.run('exchange_rate_eur_ron', '5.0');
}

/**
 * Moves money off floating point and onto whole minor units.
 *
 * Runs once. The old REAL columns are dropped rather than left alongside,
 * because two columns holding the same amount is how they come to disagree.
 *
 * The conversion is a rounding, and rounding is only lossless if the stored
 * values were already exact to the cent. They were checked before this was
 * written and every one was, which is the only reason this can be a straight
 * migration rather than a reconciliation.
 */
function migrateMoneyToMinorUnits() {
  const columns = (table) =>
    db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

  const itemCols = columns('items');
  if (itemCols.includes('estimated_amount')) {
    if (!itemCols.includes('estimated_minor')) {
      db.exec('ALTER TABLE items ADD COLUMN estimated_minor INTEGER NOT NULL DEFAULT 0;');
    }
    db.exec('UPDATE items SET estimated_minor = CAST(ROUND(COALESCE(estimated_amount, 0) * 100) AS INTEGER);');
    db.exec('ALTER TABLE items DROP COLUMN estimated_amount;');
  }

  const costCols = columns('item_costs');
  if (costCols.includes('amount')) {
    if (!costCols.includes('amount_minor')) {
      db.exec('ALTER TABLE item_costs ADD COLUMN amount_minor INTEGER NOT NULL DEFAULT 0;');
    }
    db.exec('UPDATE item_costs SET amount_minor = CAST(ROUND(COALESCE(amount, 0) * 100) AS INTEGER);');
    db.exec('ALTER TABLE item_costs DROP COLUMN amount;');
  }
}

initDb();
