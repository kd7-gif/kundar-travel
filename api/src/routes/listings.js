import { Router } from 'express';
import { pool } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { isIsoDate, nightsCount, todayLagos, addDays } from '../lib/dates.js';
import { mediaUrl } from '../lib/media.js';

export const CITIES = ['Lagos', 'Abuja', 'Ibadan', 'Port Harcourt'];
const MAX_NIGHTS = 60;

// A night counts as taken when its booking is a confirmed one (host block / paid stay)
// or a hold that has not expired yet. Expired holds are ignored even before they are swept.
export const LIVE_BOOKING = `(b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > NOW()))`;

const LISTING_COLUMNS = `
  l.id, l.slug, l.name, l.city, l.area, l.type, l.price_kobo, l.max_guests, l.about,
  l.rating, l.review_count, p.url_small, p.url_large, p.alt`;

function serialize(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    area: row.area,
    type: row.type,
    price: row.price_kobo / 100,      // naira, for display
    priceKobo: row.price_kobo,
    maxGuests: row.max_guests,
    about: row.about,
    rating: Number(row.rating),
    reviews: row.review_count,
    image: { small: mediaUrl(row.url_small), large: mediaUrl(row.url_large), alt: row.alt }
  };
}

/** Validates ?city&checkin&checkout&guests. All optional, but dates come as a pair. */
export function parseSearch(q) {
  const out = {};
  if (q.city !== undefined && q.city !== '') {
    const city = CITIES.find(c => c.toLowerCase() === String(q.city).toLowerCase());
    if (!city) throw badRequest(`city must be one of: ${CITIES.join(', ')}`);
    out.city = city;
  }
  if (q.guests !== undefined && q.guests !== '') {
    const g = Number(q.guests);
    if (!Number.isInteger(g) || g < 1 || g > 16) throw badRequest('guests must be a whole number from 1 to 16');
    out.guests = g;
  }
  const hasIn = q.checkin !== undefined && q.checkin !== '';
  const hasOut = q.checkout !== undefined && q.checkout !== '';
  if (hasIn !== hasOut) throw badRequest('checkin and checkout must be sent together');
  if (hasIn) {
    if (!isIsoDate(q.checkin) || !isIsoDate(q.checkout)) throw badRequest('dates must be YYYY-MM-DD');
    if (q.checkin < todayLagos()) throw badRequest('checkin cannot be in the past');
    const n = nightsCount(q.checkin, q.checkout);
    if (n < 1) throw badRequest('checkout must be after checkin');
    if (n > MAX_NIGHTS) throw badRequest(`stays are limited to ${MAX_NIGHTS} nights`);
    out.checkin = q.checkin;
    out.checkout = q.checkout;
    out.nights = n;
  }
  return out;
}

export const listingsRouter = Router();

// GET /api/listings?city=Lagos&checkin=2026-12-18&checkout=2026-12-22&guests=3
listingsRouter.get('/', async (req, res) => {
  const f = parseSearch(req.query);
  const where = [`l.status = 'active'`];
  const params = [];
  if (f.city) { where.push('l.city = ?'); params.push(f.city); }
  if (f.guests) { where.push('l.max_guests >= ?'); params.push(f.guests); }
  if (f.checkin) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM booking_nights bn
      JOIN bookings b ON b.id = bn.booking_id
      WHERE bn.listing_id = l.id AND bn.night >= ? AND bn.night < ? AND ${LIVE_BOOKING})`);
    params.push(f.checkin, f.checkout);
  }
  const [rows] = await pool.query(
    `SELECT ${LISTING_COLUMNS}
       FROM listings l
       LEFT JOIN listing_photos p ON p.listing_id = l.id AND p.position = 0
      WHERE ${where.join(' AND ')}
      ORDER BY l.id`,
    params
  );
  res.json({ filters: f, count: rows.length, listings: rows.map(serialize) });
});

async function findListing(idOrSlug) {
  const byId = /^\d+$/.test(idOrSlug);
  const [rows] = await pool.query(
    `SELECT ${LISTING_COLUMNS}, u.name AS host_name, u.avatar_url AS host_avatar
       FROM listings l
       JOIN users u ON u.id = l.host_id
       LEFT JOIN listing_photos p ON p.listing_id = l.id AND p.position = 0
      WHERE l.status = 'active' AND ${byId ? 'l.id = ?' : 'l.slug = ?'}`,
    [byId ? Number(idOrSlug) : idOrSlug]
  );
  if (!rows.length) throw notFound('Listing not found');
  return rows[0];
}

// GET /api/listings/:id  (numeric id or slug)
listingsRouter.get('/:id', async (req, res) => {
  const row = await findListing(req.params.id);
  const [photos] = await pool.query(
    `SELECT url_small AS small, url_large AS large, alt, position
       FROM listing_photos WHERE listing_id = ? ORDER BY position`,
    [row.id]
  );
  res.json({
    listing: {
      ...serialize(row),
      host: { name: row.host_name, avatar: row.host_avatar },
      photos: photos.map(p => ({ ...p, small: mediaUrl(p.small), large: mediaUrl(p.large) }))
    }
  });
});

// GET /api/listings/:id/unavailable?from=2026-12-01&to=2027-01-31
// Nights that cannot be booked, for greying out a calendar.
listingsRouter.get('/:id/unavailable', async (req, res) => {
  const row = await findListing(req.params.id);
  const from = req.query.from || todayLagos();
  const to = req.query.to || addDays(from, 180);
  if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('from and to must be YYYY-MM-DD');
  if (to <= from) throw badRequest('to must be after from');
  if (nightsCount(from, to) > 366) throw badRequest('range is limited to 366 days');
  const [nights] = await pool.query(
    `SELECT bn.night FROM booking_nights bn
       JOIN bookings b ON b.id = bn.booking_id
      WHERE bn.listing_id = ? AND bn.night >= ? AND bn.night < ? AND ${LIVE_BOOKING}
      ORDER BY bn.night`,
    [row.id, from, to]
  );
  res.json({ listingId: row.id, from, to, nights: nights.map(n => n.night) });
});
