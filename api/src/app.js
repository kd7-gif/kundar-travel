import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { listingsRouter } from './routes/listings.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { hostRouter } from './routes/host.js';
import { loadUser } from './auth.js';
import { HttpError } from './lib/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Number of proxies in front of the API (Render = 1; Netlify proxy + Render = 2).
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

  const origins = (process.env.CORS_ORIGIN || 'http://localhost:5180,http://127.0.0.1:5180')
    .split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  // CSRF defence in depth (on top of SameSite cookies and the CORS allowlist):
  // state-changing requests must be JSON, which a cross-site HTML form cannot send.
  app.use((req, _res, next) => {
    const type = String(req.headers['content-type'] || '').toLowerCase();
    // Photo uploads send raw image bytes plus a custom header (which also forces a CORS preflight).
    const isUpload = req.get('x-kundar-upload') === '1' && type.startsWith('image/');
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !type.startsWith('application/json') && !isUpload) {
      return next(new HttpError(415, 'json_required', 'Send requests as application/json'));
    }
    next();
  });
  app.use(loadUser);

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true' });
  });

  app.use('/api/listings', listingsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/host', hostRouter);

  // Host-uploaded photos, stored in MySQL. Names are random and never reused, so cache forever.
  app.get('/uploads/:name', async (req, res) => {
    if (!/^[\w-]{1,70}\.(jpg|png|webp)$/.test(req.params.name)) throw new HttpError(404, 'not_found', 'Photo not found');
    const [[file]] = await pool.query('SELECT mime, bytes FROM photo_files WHERE name = ?', [req.params.name]);
    if (!file) throw new HttpError(404, 'not_found', 'Photo not found');
    res.set({
      'Content-Type': file.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    res.send(file.bytes);
  });

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Route not found')));

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'too_large', message: 'That file is too big (max 5 MB)' } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong' } });
  });

  return app;
}
