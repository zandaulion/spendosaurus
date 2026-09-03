import crypto from 'node:crypto';
import { db, nowIso } from './db.js';

export const COOKIE_NAME = 'spendosaurus_token';
export const INVITE_TTL_DAYS = 7;

export const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function normaliseCode(c) {
  return String(c || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

const publicBase = () => (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

// Rate limiting for redeem attempts
const failures = [];
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_LIMIT = 20;

function tooManyFailures() {
  const cutoff = Date.now() - FAIL_WINDOW_MS;
  while (failures.length && failures[0] < cutoff) failures.shift();
  return failures.length >= FAIL_LIMIT;
}

function recordFailure() {
  failures.push(Date.now());
}

export class ThrottledError extends Error {
  constructor() {
    super('Too many attempts. Wait a few minutes and try again.');
    this.status = 429;
  }
}

// ---------------------------------------------------------------- Admin API

export function listDevices() {
  const rows = db.prepare(`
    SELECT id, label, created_at, last_seen, revoked, has_push
    FROM devices ORDER BY created_at DESC
  `).all();
  return {
    devices: rows.map((r) => ({
      id: r.id,
      label: r.label || 'Unnamed Device',
      created_at: r.created_at,
      last_seen: r.last_seen,
      revoked: Boolean(r.revoked),
      has_push: Boolean(r.has_push)
    }))
  };
}

export function setDeviceRevoked(id, revoked) {
  db.prepare('UPDATE devices SET revoked = ? WHERE id = ?').run(revoked ? 1 : 0, id);
}

export function setDeviceLabel(id, label) {
  db.prepare('UPDATE devices SET label = ? WHERE id = ?').run(label || null, id);
}

export function deleteDevice(id) {
  db.prepare('DELETE FROM devices WHERE id = ?').run(id);
}

export function listInvites() {
  const rows = db.prepare(`
    SELECT id, label, code, url, created_at, expires_at, used_at, revoked, device_id
    FROM invites ORDER BY created_at DESC
  `).all();

  return {
    ttl_days: INVITE_TTL_DAYS,
    invites: rows.map((r) => ({
      id: r.id,
      label: r.label,
      created_at: r.created_at,
      expires_at: r.expires_at,
      used_at: r.used_at,
      revoked: Boolean(r.revoked),
      device_id: r.device_id,
      code: r.code,
      url: r.url
    }))
  };
}

export function createInvite(label = null) {
  const code = randomCode();
  const base = publicBase();
  const url = base ? `${base}/?invite=${encodeURIComponent(code)}` : null;
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString();

  const out = db.prepare(`
    INSERT INTO invites (code_hash, code, label, url, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hash(normaliseCode(code)), code, label, url, nowIso(), expiresAt);

  return {
    id: Number(out.lastInsertRowid),
    code,
    url,
    label,
    expires_at: expiresAt,
    expires_in_days: INVITE_TTL_DAYS
  };
}

export function revokeInvite(id) {
  db.prepare('UPDATE invites SET revoked = 1, code = NULL, url = NULL WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- Device Auth

export function redeemInvite(codeStr, initialLabel = null) {
  if (tooManyFailures()) throw new ThrottledError();

  const codeClean = normaliseCode(codeStr);
  if (!codeClean) {
    recordFailure();
    const err = new Error('Invalid invite code');
    err.status = 400;
    throw err;
  }

  const codeH = hash(codeClean);
  const invite = db.prepare(`
    SELECT * FROM invites
    WHERE code_hash = ? AND revoked = 0 AND used_at IS NULL
  `).get(codeH);

  if (!invite) {
    recordFailure();
    const err = new Error('Invite not found or already used');
    err.status = 404;
    throw err;
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    recordFailure();
    const err = new Error('Invite code has expired');
    err.status = 410;
    throw err;
  }

  const deviceId = 'dev_' + crypto.randomBytes(8).toString('hex');
  const token = randomToken();
  const tokenH = hash(token);
  const label = initialLabel || invite.label || 'Family Member';
  const now = nowIso();

  db.prepare(`
    INSERT INTO devices (id, token_hash, label, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
  `).run(deviceId, tokenH, label, now, now);

  db.prepare(`
    UPDATE invites
    SET used_at = ?, device_id = ?, code = NULL, url = NULL
    WHERE id = ?
  `).run(now, deviceId, invite.id);

  return {
    token,
    device: {
      id: deviceId,
      label,
      created_at: now
    }
  };
}

export function getDeviceByToken(token) {
  if (!token) return null;
  const tokenH = hash(token);
  const row = db.prepare(`
    SELECT id, label, created_at, last_seen, revoked
    FROM devices WHERE token_hash = ?
  `).get(tokenH);

  if (!row || row.revoked) return null;

  // Touch last_seen
  db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(nowIso(), row.id);

  return {
    id: row.id,
    label: row.label || 'Family Member',
    created_at: row.created_at,
    last_seen: row.last_seen
  };
}

// ---------------------------------------------------------------- Express Middlewares

export function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  }
  return null;
}

export function requireDevice(req, res, next) {
  const token = extractToken(req);
  const device = getDeviceByToken(token);
  if (!device) {
    return res.status(401).json({ error: 'Unauthorized device' });
  }
  req.device = device;
  next();
}

/**
 * Admin access, proved by a shared secret rather than asserted by a header.
 *
 * This used to be `X-Admin: 1` -- a constant any caller could set. It was not
 * reachable from outside, because the public listener strips it and the
 * listener that injects it is bound to the tailnet, but that made the whole
 * admin surface rest on two lines of proxy configuration with nothing behind
 * them. Anything that reached the port directly was admin.
 *
 * Now the proxy passes a secret this process also knows, so being on the right
 * listener is no longer the same thing as being trusted.
 *
 * Fails closed. If ADMIN_TOKEN is missing the answer is no, because the
 * alternative -- treating an unconfigured server as an open one -- is exactly
 * how this kind of gate quietly stops working.
 */
function adminTokenOk(supplied) {
  const expected = (process.env.ADMIN_TOKEN || '').trim();
  if (!expected) return false;
  const given = Buffer.from(String(supplied || ''));
  const want = Buffer.from(expected);
  // timingSafeEqual demands equal lengths, so compare those first. It leaks
  // the length of the secret and nothing else.
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

export function requireAdmin(req, res, next) {
  if (!adminTokenOk(req.headers['x-admin-token'])) {
    // Still a 404 rather than a 403: this surface does not announce itself.
    return res.status(404).json({ error: 'Not found' });
  }
  return next();
}
