import { randomBytes, createHash } from 'node:crypto';
import { pool } from './db.js';
import { HttpError } from './lib/errors.js';

export const COOKIE = 'kt_session';
const SESSION_DAYS = 7;
const sha256 = s => createHash('sha256').update(s).digest('hex');

// Local dev: front end and API are both on localhost, so SameSite=Lax works.
// Production on two domains (Netlify + Render) needs COOKIE_SAMESITE=none and COOKIE_SECURE=true.
function cookieOptions() {
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  const secure = process.env.COOKIE_SECURE === 'true' || sameSite === 'none';
  return { httpOnly: true, sameSite, secure, path: '/', maxAge: SESSION_DAYS * 86_400_000 };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function startSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)',
    [sha256(token), userId, SESSION_DAYS]
  );
  res.cookie(COOKIE, token, cookieOptions());
}

export async function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await pool.query('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
}

/** Attaches req.user ({ id, name, email, role, avatar }) when the session cookie is valid. */
export async function loadUser(req, _res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token && token.length < 100) {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url AS avatar
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > NOW()`,
      [sha256(token)]
    );
    req.user = rows[0] || null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please log in first'));
  next();
}

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar ?? u.avatar_url ?? null };
}
