import { Router } from 'express';
import { pool } from '../db.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { startSession, endSession, publicUser, requireAuth } from '../auth.js';
import { rateLimit } from '../lib/rateLimit.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Used when the email is unknown, so a failed login takes the same time either way.
const DUMMY_HASH = await hashPassword('timing-equaliser-not-a-real-password');

function readCredentials(body = {}, { withName = false } = {}) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!EMAIL.test(email) || email.length > 190) throw badRequest('Enter a valid email address');
  if (password.length < 8 || password.length > 200) throw badRequest('Password must be at least 8 characters');
  const out = { email, password };
  if (withName) {
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100) throw badRequest('Enter your full name');
    out.name = name;
  }
  return out;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 10,
  keyFn: req => `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`
});
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, max: 30, keyFn: req => req.ip });

export const authRouter = Router();

// POST /api/auth/signup { name, email, password }
authRouter.post('/signup', signupLimiter, async (req, res) => {
  const { name, email, password } = readCredentials(req.body, { withName: true });
  const role = req.body?.asHost === true ? 'host' : 'guest';   // anyone may list their own place
  const hash = await hashPassword(password);
  let id;
  try {
    const [r] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );
    id = r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'email_taken', 'An account with this email already exists');
    throw err;
  }
  await startSession(res, id);
  res.status(201).json({ user: publicUser({ id, name, email, role, avatar: null }) });
});

// POST /api/auth/login { email, password }
authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = readCredentials(req.body);
  const [rows] = await pool.query(
    'SELECT id, name, email, role, avatar_url, password_hash FROM users WHERE email = ?', [email]
  );
  const user = rows[0];
  const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !ok) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');
  await startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

// POST /api/auth/logout
authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

// POST /api/auth/become-host → turns a guest account into a host account
authRouter.post('/become-host', requireAuth, async (req, res) => {
  if (req.user.role === 'guest') await pool.query(`UPDATE users SET role = 'host' WHERE id = ? AND role = 'guest'`, [req.user.id]);
  res.json({ user: publicUser({ ...req.user, role: req.user.role === 'guest' ? 'host' : req.user.role }) });
});

// GET /api/auth/me → { user } or { user: null }
authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

export { requireAuth };
