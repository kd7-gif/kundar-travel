// Calendar-date helpers. Dates are plain 'YYYY-MM-DD' strings; maths is done in UTC
// so daylight-saving or server timezone never shifts a night.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

export function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const toUtc = s => new Date(s + 'T00:00:00Z');
export const fromUtc = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fromUtc(new Date(toUtc(s).getTime() + n * DAY));
export const nightsCount = (checkIn, checkOut) => Math.round((toUtc(checkOut) - toUtc(checkIn)) / DAY);

/** Every night a guest sleeps over: check-in inclusive, check-out exclusive. */
export function nightsBetween(checkIn, checkOut) {
  const out = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Today's date in Lagos (UTC+1, no DST). */
export function todayLagos() {
  return fromUtc(new Date(Date.now() + 3_600_000));
}
