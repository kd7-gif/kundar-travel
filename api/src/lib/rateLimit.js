import { HttpError } from './errors.js';

/**
 * Small in-memory fixed-window limiter (fine for one API instance).
 * keyFn(req) decides what is counted, e.g. IP + email for logins.
 */
export function rateLimit({ windowMs, max, keyFn, message = 'Too many attempts. Please wait a few minutes and try again.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, _res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === 'true') return next();
    const key = keyFn(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(key, entry); }
    entry.count += 1;
    if (entry.count > max) return next(new HttpError(429, 'rate_limited', message));
    next();
  };
}
