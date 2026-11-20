import { Router } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { pool, withTransaction } from '../db.js';
import { badRequest, notFound, HttpError } from '../lib/errors.js';
import { isIsoDate, nightsCount, todayLagos, addDays } from '../lib/dates.js';
import { insertBookingWithNights } from '../lib/nights.js';
import { sweepExpiredHolds } from '../lib/holds.js';
import { mediaUrl, sniffImage } from '../lib/media.js';
import { CITIES } from './listings.js';

const TYPES = ['Apartments', 'Houses', 'Villas'];
const MAX_PHOTOS = 12;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const hostRouter = Router();

hostRouter.use((req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please log in first'));
  if (req.user.role !== 'host' && req.user.role !== 'admin') {
    return next(new HttpError(403, 'not_a_host', 'This area is for hosts'));
  }
  next();
});

/* ---------- helpers ---------- */

const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 90) || 'stay';

/** Loads one of this host's listings or 404s (other hosts' listings look like they don't exist). */
async function ownListing(conn, hostId, id, lock = false) {
  const [[row]] = await conn.query(
    `SELECT * FROM listings WHERE id = ? AND host_id = ?${lock ? ' FOR UPDATE' : ''}`, [Number(id), hostId]);
  if (!row) throw notFound('Listing not found');
  return row;
}

function readListing(body = {}, { partial = false } = {}) {
  const out = {};
  const has = k => body[k] !== undefined;
  const need = k => { if (!partial && !has(k)) throw badRequest(`${k} is required`); return has(k); };

  if (need('name')) {
    const v = String(body.name).trim().replace(/\s+/g, ' ');
    if (v.length < 3 || v.length > 120) throw badRequest('Name must be 3–120 characters');
    out.name = v;
  }
  if (need('city')) {
    const v = CITIES.find(c => c.toLowerCase() === String(body.city).toLowerCase());
    if (!v) throw badRequest(`City must be one of: ${CITIES.join(', ')}`);
    out.city = v;
  }
  if (need('area')) {
    const v = String(body.area).trim();
    if (v.length < 2 || v.length > 120) throw badRequest('Area must be 2–120 characters');
    out.area = v;
  }
  if (need('type')) {
    if (!TYPES.includes(body.type)) throw badRequest(`Type must be one of: ${TYPES.join(', ')}`);
    out.type = body.type;
  }
  if (need('price')) {
    const v = Number(body.price);
    if (!Number.isInteger(v) || v < 5000 || v > 10_000_000) throw badRequest('Nightly price must be a whole number of naira from ₦5,000 to ₦10,000,000');
    out.price_kobo = v * 100;
  }
  if (need('maxGuests')) {
    const v = Number(body.maxGuests);
    if (!Number.isInteger(v) || v < 1 || v > 16) throw badRequest('Guests must be 1–16');
    out.max_guests = v;
  }
  if (need('about')) {
    const v = String(body.about).trim();
    if (v.length < 40 || v.length > 2000) throw badRequest('Description must be 40–2,000 characters');
    out.about = v;
  }
  if (has('status')) {
    if (!['active', 'paused'].includes(body.status)) throw badRequest('Status must be active or paused');
    out.status = body.status;
  }
  return out;
}

const LIVE_HOLDS = `(SELECT COUNT(*) FROM bookings b WHERE b.listing_id = l.id AND b.kind = 'stay'
                     AND b.status = 'held' AND b.hold_expires_at > NOW())`;

function serializeListing(r) {
  return {
    id: r.id, slug: r.slug, name: r.name, city: r.city, area: r.area, type: r.type,
    price: r.price_kobo / 100, maxGuests: r.max_guests, about: r.about, status: r.status,
    rating: Number(r.rating), reviews: r.review_count,
    cover: r.cover ? mediaUrl(r.cover, 'dashboard') : null,
    liveHolds: r.live_holds !== undefined ? Number(r.live_holds) : undefined
  };
}

async function photosFor(listingId) {
  const [rows] = await pool.query(
    'SELECT id, url_small, url_large, alt, position FROM listing_photos WHERE listing_id = ? ORDER BY position, id', [listingId]);
  return rows.map(p => ({ id: p.id, url: mediaUrl(p.url_large, 'dashboard'), thumb: mediaUrl(p.url_small, 'dashboard'), alt: p.alt, position: p.position }));
}

/** Renumbers photo positions 0..n-1 (0 = cover), keeping the given order. */
async function renumber(conn, listingId, orderedIds) {
  for (const [i, id] of orderedIds.entries()) {
    await conn.query('UPDATE listing_photos SET position = ? WHERE id = ? AND listing_id = ?', [i, id, listingId]);
  }
}

/* ---------- overview ---------- */

// GET /api/host/summary
hostRouter.get('/summary', async (req, res) => {
  const h = req.user.id;
  const [[s]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM listings WHERE host_id = ?) AS listings,
       (SELECT COUNT(*) FROM listings WHERE host_id = ? AND status = 'active') AS active_listings,
       (SELECT COUNT(*) FROM bookings b JOIN listings l ON l.id = b.listing_id
         WHERE l.host_id = ? AND b.kind = 'stay' AND b.status = 'held' AND b.hold_expires_at > NOW()) AS live_holds,
       (SELECT COALESCE(SUM(b.total_kobo), 0) FROM bookings b JOIN listings l ON l.id = b.listing_id
         WHERE l.host_id = ? AND b.kind = 'stay' AND b.status = 'held' AND b.hold_expires_at > NOW()) AS held_value_kobo,
       (SELECT COUNT(*) FROM bookings b JOIN listings l ON l.id = b.listing_id
         WHERE l.host_id = ? AND b.kind = 'stay' AND b.created_at > NOW() - INTERVAL 30 DAY) AS holds_30d,
       (SELECT COUNT(*) FROM booking_nights bn JOIN bookings b ON b.id = bn.booking_id JOIN listings l ON l.id = bn.listing_id
         WHERE l.host_id = ? AND b.kind = 'block' AND bn.night >= CURDATE()) AS blocked_nights`,
    [h, h, h, h, h, h]);
  res.json({
    summary: {
      listings: s.listings, activeListings: s.active_listings, liveHolds: s.live_holds,
      heldValue: Number(s.held_value_kobo) / 100, holdsLast30Days: s.holds_30d, upcomingBlockedNights: s.blocked_nights
    },
    paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true'
  });
});

// GET /api/host/bookings?status=live|all  — guest holds on this host's listings
hostRouter.get('/bookings', async (req, res) => {
  const liveOnly = req.query.status === 'live';
  const [rows] = await pool.query(
    `SELECT b.id, b.listing_id, l.name AS listing_name, u.name AS guest_name, b.check_in, b.check_out, b.guests,
            b.total_kobo, b.created_at, b.hold_expires_at,
            CASE WHEN b.status = 'held' AND b.hold_expires_at <= NOW() THEN 'expired' ELSE b.status END AS status
       FROM bookings b
       JOIN listings l ON l.id = b.listing_id
       LEFT JOIN users u ON u.id = b.guest_id
      WHERE l.host_id = ? AND b.kind = 'stay'
        ${liveOnly ? "AND b.status = 'held' AND b.hold_expires_at > NOW()" : ''}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 200`, [req.user.id]);
  res.json({
    bookings: rows.map(r => ({
      id: r.id, listing: { id: r.listing_id, name: r.listing_name }, guest: r.guest_name,
      checkIn: r.check_in, checkOut: r.check_out, nights: nightsCount(r.check_in, r.check_out), guests: r.guests,
      total: Number(r.total_kobo) / 100, status: r.status,
      createdAt: r.created_at.replace(' ', 'T') + '+01:00',
      holdExpiresAt: r.status === 'held' ? r.hold_expires_at.replace(' ', 'T') + '+01:00' : null
    }))
  });
});

/* ---------- listings ---------- */

// GET /api/host/listings
hostRouter.get('/listings', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.*, p.url_small AS cover, ${LIVE_HOLDS} AS live_holds
       FROM listings l
       LEFT JOIN listing_photos p ON p.listing_id = l.id AND p.position = 0
      WHERE l.host_id = ?
      ORDER BY l.created_at DESC, l.id DESC`, [req.user.id]);
  res.json({ listings: rows.map(serializeListing) });
});

// POST /api/host/listings
hostRouter.post('/listings', async (req, res) => {
  const f = readListing(req.body);
  const base = slugify(`${f.name} ${f.area.split(',')[0]}`);
  let id;
  for (let i = 0; !id; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    try {
      const [r] = await pool.query(
        `INSERT INTO listings (host_id, slug, name, city, area, type, price_kobo, max_guests, about, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paused')`,
        [req.user.id, slug, f.name, f.city, f.area, f.type, f.price_kobo, f.max_guests, f.about]);
      id = r.insertId;
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY' || i > 20) throw err;
    }
  }
  const row = await ownListing(pool, req.user.id, id);
  res.status(201).json({ listing: { ...serializeListing(row), photos: [] } });
});

// GET /api/host/listings/:id
hostRouter.get('/listings/:id', async (req, res) => {
  const row = await ownListing(pool, req.user.id, req.params.id);
  const photos = await photosFor(row.id);
  res.json({ listing: { ...serializeListing({ ...row, cover: photos[0]?.thumb }), cover: photos[0]?.thumb ?? null, photos } });
});

// PATCH /api/host/listings/:id
hostRouter.patch('/listings/:id', async (req, res) => {
  const row = await ownListing(pool, req.user.id, req.params.id);
  const f = readListing(req.body, { partial: true });
  if (f.status === 'active') {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM listing_photos WHERE listing_id = ?', [row.id]);
    if (!n) throw badRequest('Add at least one photo before publishing');
  }
  const keys = Object.keys(f);
  if (keys.length) {
    await pool.query(`UPDATE listings SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => f[k]), row.id]);
  }
  const updated = await ownListing(pool, req.user.id, row.id);
  const photos = await photosFor(row.id);
  res.json({ listing: { ...serializeListing(updated), cover: photos[0]?.thumb ?? null, photos } });
});

/* ---------- photos ---------- */

// POST /api/host/listings/:id/photos   body = the raw image file (Content-Type: image/jpeg|png|webp)
// Needs the X-Kundar-Upload header: a custom header forces a CORS preflight, so other sites can't post here.
hostRouter.post('/listings/:id/photos',
  (req, _res, next) => req.get('x-kundar-upload') === '1' ? next() : next(new HttpError(400, 'bad_request', 'Missing upload header')),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    const row = await ownListing(pool, req.user.id, req.params.id);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Send a JPEG, PNG or WebP image (max 5 MB)');
    const ext = sniffImage(req.body);
    if (!ext) throw badRequest('That file is not a JPEG, PNG or WebP image');
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM listing_photos WHERE listing_id = ?', [row.id]);
    if (n >= MAX_PHOTOS) throw badRequest(`A listing can have up to ${MAX_PHOTOS} photos`);

    const file = `${row.id}-${randomBytes(8).toString('hex')}.${ext}`;
    const url = `uploads/${file}`;
    const alt = String(req.get('x-photo-alt') || `${row.name}, ${row.area}`).slice(0, 200);
    await withTransaction(async conn => {
      await conn.query('INSERT INTO photo_files (name, mime, bytes) VALUES (?, ?, ?)',
        [file, ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, req.body]);
      await conn.query('INSERT INTO listing_photos (listing_id, url_small, url_large, alt, position) VALUES (?, ?, ?, ?, ?)',
        [row.id, url, url, alt, n]);
    });
    res.status(201).json({ photos: await photosFor(row.id) });
  });

// POST /api/host/listings/:id/photos/:photoId/cover
hostRouter.post('/listings/:id/photos/:photoId/cover', async (req, res) => {
  const listingId = (await ownListing(pool, req.user.id, req.params.id)).id;
  const photoId = Number(req.params.photoId);
  await withTransaction(async conn => {
    const [rows] = await conn.query('SELECT id FROM listing_photos WHERE listing_id = ? ORDER BY position, id FOR UPDATE', [listingId]);
    if (!rows.some(r => r.id === photoId)) throw notFound('Photo not found');
    await renumber(conn, listingId, [photoId, ...rows.map(r => r.id).filter(id => id !== photoId)]);
  });
  res.json({ photos: await photosFor(listingId) });
});

// DELETE /api/host/listings/:id/photos/:photoId
hostRouter.delete('/listings/:id/photos/:photoId', async (req, res) => {
  const listing = await ownListing(pool, req.user.id, req.params.id);
  const photoId = Number(req.params.photoId);
  let removedUrl;
  await withTransaction(async conn => {
    const [rows] = await conn.query('SELECT id, url_large FROM listing_photos WHERE listing_id = ? ORDER BY position, id FOR UPDATE', [listing.id]);
    const target = rows.find(r => r.id === photoId);
    if (!target) throw notFound('Photo not found');
    if (rows.length === 1 && listing.status === 'active') throw badRequest('A published listing needs at least one photo. Pause it first.');
    await conn.query('DELETE FROM listing_photos WHERE id = ?', [photoId]);
    await renumber(conn, listing.id, rows.map(r => r.id).filter(id => id !== photoId));
    removedUrl = target.url_large;
  });
  if (removedUrl?.startsWith('uploads/')) {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM listing_photos WHERE url_large = ?', [removedUrl]);
    if (!n) await pool.query('DELETE FROM photo_files WHERE name = ?', [removedUrl.slice('uploads/'.length)]);
  }
  res.json({ photos: await photosFor(listing.id) });
});

/* ---------- calendar + blocks ---------- */

// GET /api/host/listings/:id/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
hostRouter.get('/listings/:id/calendar', async (req, res) => {
  const listing = await ownListing(pool, req.user.id, req.params.id);
  const from = req.query.from || todayLagos();
  const to = req.query.to || addDays(from, 92);
  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) throw badRequest('from and to must be YYYY-MM-DD, with to after from');
  if (nightsCount(from, to) > 400) throw badRequest('range is limited to 400 days');
  await sweepExpiredHolds(pool, listing.id);
  const [rows] = await pool.query(
    `SELECT b.id, b.kind, b.check_in, b.check_out, b.guests, b.total_kobo, b.hold_expires_at, u.name AS guest_name
       FROM bookings b LEFT JOIN users u ON u.id = b.guest_id
      WHERE b.listing_id = ? AND b.check_out > ? AND b.check_in < ?
        AND (b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > NOW()))
      ORDER BY b.check_in`, [listing.id, from, to]);
  res.json({
    listingId: listing.id, from, to,
    entries: rows.map(r => ({
      id: r.id, kind: r.kind, checkIn: r.check_in, checkOut: r.check_out,
      guest: r.kind === 'stay' ? r.guest_name : null, guests: r.kind === 'stay' ? r.guests : null,
      total: r.kind === 'stay' ? Number(r.total_kobo) / 100 : null,
      holdExpiresAt: r.kind === 'stay' ? r.hold_expires_at.replace(' ', 'T') + '+01:00' : null
    }))
  });
});

// POST /api/host/listings/:id/blocks { checkIn, checkOut }
hostRouter.post('/listings/:id/blocks', async (req, res) => {
  const listing = await ownListing(pool, req.user.id, req.params.id);
  const { checkIn, checkOut } = req.body || {};
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw badRequest('checkIn and checkOut must be YYYY-MM-DD');
  if (checkIn < todayLagos()) throw badRequest('You can only block dates from today onwards');
  const n = nightsCount(checkIn, checkOut);
  if (n < 1) throw badRequest('checkOut must be after checkIn');
  if (n > 365) throw badRequest('Blocks are limited to 365 nights');
  const id = await withTransaction(async conn => {
    await sweepExpiredHolds(conn, listing.id);
    try {
      return await insertBookingWithNights(conn, { listingId: listing.id, kind: 'block', status: 'confirmed', checkIn, checkOut });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'dates_unavailable', 'Some of those nights are already held by a guest or blocked');
      throw err;
    }
  }, { isolation: 'READ COMMITTED' });
  res.status(201).json({ block: { id, checkIn, checkOut, nights: n } });
});

// DELETE /api/host/blocks/:id
hostRouter.delete('/blocks/:id', async (req, res) => {
  await withTransaction(async conn => {
    const [[row]] = await conn.query(
      `SELECT b.id FROM bookings b JOIN listings l ON l.id = b.listing_id
        WHERE b.id = ? AND l.host_id = ? AND b.kind = 'block' AND b.status = 'confirmed' FOR UPDATE`,
      [Number(req.params.id), req.user.id]);
    if (!row) throw notFound('Block not found');
    await conn.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [row.id]);
    await conn.query('DELETE FROM booking_nights WHERE booking_id = ?', [row.id]);
  });
  res.status(204).end();
});
