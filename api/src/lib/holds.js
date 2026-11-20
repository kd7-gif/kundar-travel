import { pool } from '../db.js';

export const HOLD_MINUTES = Number(process.env.HOLD_MINUTES || 15);
export const MAX_ACTIVE_HOLDS = 3;
export const PAYMENT_UNAVAILABLE = 'Payment is unavailable — this is a demo project.';

/**
 * Marks overdue holds as expired and frees their nights.
 * With a listingId it only touches that listing (used inside a booking transaction,
 * so a stale hold never blocks a new guest); without one it sweeps everything.
 */
export async function sweepExpiredHolds(conn = pool, listingId = null) {
  const onListing = listingId ? ' AND listing_id = ?' : '';
  const params = listingId ? [listingId] : [];
  await conn.query(
    `UPDATE bookings SET status = 'expired'
      WHERE status = 'held' AND hold_expires_at <= NOW()${onListing}`, params);
  await conn.query(
    `DELETE bn FROM booking_nights bn
       JOIN bookings b ON b.id = bn.booking_id
      WHERE b.status IN ('expired', 'cancelled')${listingId ? ' AND bn.listing_id = ?' : ''}`, params);
}

/** Starts a background sweep; returns the timer so tests/shutdown can stop it. */
export function startHoldSweeper(everyMs = 60_000) {
  const timer = setInterval(async () => {
    try {
      await sweepExpiredHolds();
      await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
    } catch (err) {
      console.error('[sweeper]', err.message);
    }
  }, everyMs);
  timer.unref();
  return timer;
}
