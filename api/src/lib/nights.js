import { nightsBetween } from './dates.js';

/**
 * Inserts a booking and claims each of its nights in booking_nights.
 * Must run inside a transaction: if any night is already taken, MySQL raises
 * ER_DUP_ENTRY on the (listing_id, night) primary key and the caller rolls back.
 */
export async function insertBookingWithNights(conn, b) {
  const [res] = await conn.query(
    `INSERT INTO bookings (listing_id, guest_id, kind, check_in, check_out, guests, total_kobo, status, hold_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.listingId, b.guestId ?? null, b.kind ?? 'stay', b.checkIn, b.checkOut, b.guests ?? 1,
     b.totalKobo ?? 0, b.status ?? 'held', b.holdExpiresAt ?? null]
  );
  const id = res.insertId;
  const rows = nightsBetween(b.checkIn, b.checkOut).map(night => [b.listingId, night, id]);
  await conn.query('INSERT INTO booking_nights (listing_id, night, booking_id) VALUES ?', [rows]);
  return id;
}
