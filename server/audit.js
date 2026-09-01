import { db, nowIso } from './db.js';

/**
 * Record an entry into the audit trail.
 * @param {Object} opts
 * @param {string|null} opts.itemId
 * @param {string} opts.action - e.g. 'create_item', 'update_item', 'delete_item', 'status_change', 'add_cost', 'delete_cost'
 * @param {string} opts.summary - Human-readable sentence e.g. "Alex added cost of 350 RON"
 * @param {Object} [opts.details] - Structured metadata / field diff
 * @param {string|null} [opts.deviceId]
 * @param {string|null} [opts.deviceLabel]
 */
export function recordAudit({ itemId = null, action, summary, details = null, deviceId = null, deviceLabel = null }) {
  const detailsJson = details ? JSON.stringify(details) : null;
  const stmt = db.prepare(`
    INSERT INTO audit_log (item_id, action, summary, details_json, device_id, device_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(itemId, action, summary, detailsJson, deviceId, deviceLabel, nowIso());
}

/**
 * List audit records, optionally filtered by item.
 */
export function listAuditLogs({ limit = 100, itemId = null } = {}) {
  let query = 'SELECT id, item_id, action, summary, details_json, device_id, device_label, created_at FROM audit_log';
  const params = [];

  if (itemId) {
    query += ' WHERE item_id = ?';
    params.push(itemId);
  }

  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    id: r.id,
    item_id: r.item_id,
    action: r.action,
    summary: r.summary,
    details: r.details_json ? JSON.parse(r.details_json) : null,
    device_id: r.device_id,
    device_label: r.device_label,
    created_at: r.created_at
  }));
}
