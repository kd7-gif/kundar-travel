import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { listingsRouter } from './routes/listings.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { loadUser } from './auth.js';
import { HttpError } from './lib/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const origins = (process.env.CORS_ORIGIN || 'http://localhost:5180,http://127.0.0.1:5180')
    .split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  // CSRF defence in depth (on top of SameSite cookies and the CORS allowlist):
  // state-changing requests must be JSON, which a cross-site HTML form cannot send.
  app.use((req, _res, next) => {
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !type.startsWith('application/json')) {
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

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Route not found')));

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong' } });
  });

  return app;
}
