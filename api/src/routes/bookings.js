import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, notFound, HttpError } from '../lib/errors.js';
import { isIsoDate, nightsCount, todayLagos } from '../lib/dates.js';
import { insertBookingWithNights } from '../lib/nights.js';
import { mediaUrl } from '../lib/media.js';
import { sweepExpiredHolds, HOLD_MINUTES, MAX_ACTIVE_HOLDS, PAYMENT_UNAVAILABLE } from '../lib/holds.js';

const MAX_NIGHTS = 60;
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === 'true';
const lagosIso = dt => dt ? dt.replace(' ', 'T') + '+01:00' : null;

const BOOKING_SELECT = `
  SELECT b.id, b.listing_id, b.check_in, b.check_out, b.guests, b.total_kobo, b.hold_expires_at, b.created_at,
         CASE WHEN b.status = 'held' AND b.hold_expires_at <= NOW() THEN 'expired' ELSE b.status END AS status,
         l.name AS listing_name, l.area AS listing_area, p.url_small AS listing_image
    FROM bookings b
    JOIN listings l ON l.id = b.listing_id
    LEFT JOIN listing_photos p ON p.listing_id = l.id AND p.position = 0`;

function serialize(r) {
  return {
    id: r.id,
    listing: { id: r.listing_id, name: r.listing_name, area: r.listing_area, image: mediaUrl(r.listing_image) },
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: nightsCount(r.check_in, r.check_out),
    guests: r.guests,
    totalKobo: Number(r.total_kobo),
    total: Number(r.total_kobo) / 100,
    status: r.status,
    holdExpiresAt: r.status === 'held' ? lagosIso(r.hold_expires_at) : null,
    payment: paymentsEnabled()
      ? { available: true }
      : { available: false, message: PAYMENT_UNAVAILABLE }
  };
}

async function loadBooking(id, userId) {
  const [rows] = await pool.query(`${BOOKING_SELECT} WHERE b.id = ? AND b.guest_id = ?`, [id, userId]);
  if (!rows.length) throw notFound('Booking not found');
  return rows[0];
}

function readBookingRequest(body = {}) {
  const listingId = Number(body.listingId);
  const guests = Number(body.guests ?? 1);
  const { checkIn, checkOut } = body;
  if (!Number.isInteger(listingId) || listingId < 1) throw badRequest('listingId is required');
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw badRequest('checkIn and checkOut must be YYYY-MM-DD');
  if (checkIn < todayLagos()) throw badRequest('checkIn cannot be in the past');
  const nights = nightsCount(checkIn, checkOut);
  if (nights < 1) throw badRequest('checkOut must be after checkIn');
  if (nights > MAX_NIGHTS) throw badRequest(`Stays are limited to ${MAX_NIGHTS} nights`);
  if (!Number.isInteger(guests) || guests < 1) throw badRequest('guests must be at least 1');
  return { listingId, checkIn, checkOut, guests, nights };
}

/** Runs fn in a READ COMMITTED transaction, retrying a few times on deadlocks. */
async function withRetry(fn, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      return await withTransaction(fn, { isolation: 'READ COMMITTED' });
    } catch (err) {
      if (!RETRYABLE.has(err.code) || i >= attempts) throw err;
      await new Promise(r => setTimeout(r, 15 * i + Math.random() * 25));
    }
  }
}

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

// POST /api/bookings { listingId, checkIn, checkOut, guests } → 201 hold | 409 dates taken
bookingsRouter.post('/', async (req, res) => {
  const b = readBookingRequest(req.body);
  const userId = req.user.id;

  const bookingId = await withRetry(async conn => {
    const [[listing]] = await conn.query(
      `SELECT id, price_kobo, max_guests FROM listings WHERE id = ? AND status = 'active'`, [b.listingId]);
    if (!listing) throw notFound('Listing not found');
    if (b.guests > listing.max_guests) throw badRequest(`This place sleeps up to ${listing.max_guests} guests`);

    const [[{ active }]] = await conn.query(
      `SELECT COUNT(*) AS active FROM bookings
        WHERE guest_id = ? AND status = 'held' AND hold_expires_at > NOW()`, [userId]);
    if (active >= MAX_ACTIVE_HOLDS) {
      throw new HttpError(409, 'too_many_holds', `You can hold up to ${MAX_ACTIVE_HOLDS} stays at a time. Release one first.`);
    }

    // Free any overdue holds on this listing so they never block a real guest.
    await sweepExpiredHolds(conn, b.listingId);

    const [[{ expires }]] = await conn.query('SELECT NOW() + INTERVAL ? MINUTE AS expires', [HOLD_MINUTES]);
    try {
      return await insertBookingWithNights(conn, {
        listingId: b.listingId, guestId: userId, kind: 'stay', status: 'held',
        checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests,
        totalKobo: listing.price_kobo * b.nights, holdExpiresAt: expires
      });
    } catch (err) {
      // The (listing_id, night) primary key rejected an overlapping night.
      if (err.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, 'dates_unavailable', 'Those dates were just taken. Please pick other dates.');
      }
      throw err;
    }
  });

  res.status(201).json({ booking: serialize(await loadBooking(bookingId, userId)) });
});

// GET /api/bookings/mine
bookingsRouter.get('/mine', async (req, res) => {
  const [rows] = await pool.query(`${BOOKING_SELECT} WHERE b.guest_id = ? ORDER BY b.created_at DESC, b.id DESC`, [req.user.id]);
  res.json({ bookings: rows.map(serialize) });
});

// GET /api/bookings/:id
bookingsRouter.get('/:id', async (req, res) => {
  res.json({ booking: serialize(await loadBooking(Number(req.params.id), req.user.id)) });
});

// DELETE /api/bookings/:id → releases a live hold and frees its nights
bookingsRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async conn => {
    const [[row]] = await conn.query(
      `SELECT id, status, hold_expires_at <= NOW() AS overdue FROM bookings
        WHERE id = ? AND guest_id = ? FOR UPDATE`, [id, req.user.id]);
    if (!row) throw notFound('Booking not found');
    if (row.status !== 'held' || row.overdue) throw new HttpError(409, 'not_held', 'This booking is no longer on hold');
    await conn.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [id]);
    await conn.query('DELETE FROM booking_nights WHERE booking_id = ?', [id]);
  });
  res.json({ booking: serialize(await loadBooking(id, req.user.id)) });
});

// POST /api/bookings/:id/pay → payments are switched off in this demo
bookingsRouter.post('/:id/pay', async (req, res) => {
  const booking = await loadBooking(Number(req.params.id), req.user.id);
  if (!paymentsEnabled()) {
    throw new HttpError(503, 'payments_unavailable', PAYMENT_UNAVAILABLE, { bookingId: booking.id });
  }
  throw new HttpError(501, 'not_implemented', 'No payment provider is configured');
});
