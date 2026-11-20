// Integration tests against a real MySQL database (TEST_DB_NAME, default kundar_test).
// The database is rebuilt from schema.sql + seed before the run.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_NAME = process.env.TEST_DB_NAME || 'kundar_test';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.PAYMENTS_ENABLED = 'false';
process.env.DB_POOL_SIZE = '25';

const { seed, defaultConfig } = await import('../db/seed-lib.js');
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

let server, base;

before(async () => {
  await seed(defaultConfig(), { quiet: true });
  server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise(r => server.close(r));
  await pool.end();
});

/** Tiny client that keeps its own session cookie, like one browser. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: set };
  };
}

let seq = 0;
async function newGuest() {
  const c = client();
  const r = await c('POST', '/auth/signup', { name: 'Test Guest', email: `guest${Date.now()}${seq++}@example.test`, password: 'correct-horse' });
  assert.equal(r.status, 201);
  return c;
}

const LEKKI = 1, IKOYI = 2, VI = 8;

test('signup sets an HttpOnly session cookie and /me returns the user', async () => {
  const c = client();
  const email = `ada${Date.now()}@example.test`;
  const r = await c('POST', '/auth/signup', { name: 'Ada Obi', email, password: 'longenough' });
  assert.equal(r.status, 201);
  assert.match(r.setCookie, /kt_session=.+HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Lax/i);
  const me = await c('GET', '/auth/me');
  assert.equal(me.body.user.email, email);
  assert.equal(me.body.user.role, 'guest');

  const dup = await client()('POST', '/auth/signup', { name: 'Ada Again', email, password: 'longenough' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'email_taken');
});

test('login checks the password; logout ends the session', async () => {
  const email = `bayo${Date.now()}@example.test`;
  await client()('POST', '/auth/signup', { name: 'Bayo Lawal', email, password: 'right-password' });

  const c = client();
  assert.equal((await c('POST', '/auth/login', { email, password: 'wrong-password' })).status, 401);
  assert.equal((await c('POST', '/auth/login', { email: 'nobody@example.test', password: 'whatever1' })).status, 401);
  assert.equal((await c('POST', '/auth/login', { email, password: 'right-password' })).status, 200);
  assert.equal((await c('GET', '/auth/me')).body.user.email, email);
  assert.equal((await c('POST', '/auth/logout', {})).status, 204);
  assert.equal((await c('GET', '/auth/me')).body.user, null);
});

test('bookings need a login, and mutating requests must be JSON', async () => {
  const anon = client();
  const r = await anon('POST', '/bookings', { listingId: LEKKI, checkIn: '2027-03-01', checkOut: '2027-03-03', guests: 2 });
  assert.equal(r.status, 401);
  const form = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
  assert.equal(form.status, 415);
});

test('a hold blocks those nights, search hides the listing, and release frees them', async () => {
  const ada = await newGuest();
  const bayo = await newGuest();
  const stay = { listingId: IKOYI, checkIn: '2027-03-10', checkOut: '2027-03-13', guests: 2 };

  const held = await ada('POST', '/bookings', stay);
  assert.equal(held.status, 201);
  assert.equal(held.body.booking.status, 'held');
  assert.equal(held.body.booking.nights, 3);
  assert.equal(held.body.booking.total, 450000);
  assert.ok(held.body.booking.holdExpiresAt.endsWith('+01:00'));
  assert.deepEqual(held.body.booking.payment, { available: false, message: 'Payment is unavailable — this is a demo project.' });

  // overlapping by one night → rejected by the booking_nights primary key
  const clash = await bayo('POST', '/bookings', { ...stay, checkIn: '2027-03-12', checkOut: '2027-03-14' });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error.code, 'dates_unavailable');

  // check-out is exclusive: arriving the morning Ada leaves is fine
  const back2back = await bayo('POST', '/bookings', { ...stay, checkIn: '2027-03-13', checkOut: '2027-03-15' });
  assert.equal(back2back.status, 201);

  const search = await ada('GET', '/listings?city=Lagos&checkin=2027-03-11&checkout=2027-03-12');
  assert.ok(!search.body.listings.some(l => l.id === IKOYI));
  const unavailable = await ada('GET', `/listings/${IKOYI}/unavailable?from=2027-03-01&to=2027-04-01`);
  assert.deepEqual(unavailable.body.nights, ['2027-03-10', '2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14']);

  // someone else can't release Ada's hold
  assert.equal((await bayo('DELETE', `/bookings/${held.body.booking.id}`)).status, 404);
  const released = await ada('DELETE', `/bookings/${held.body.booking.id}`);
  assert.equal(released.status, 200);
  assert.equal(released.body.booking.status, 'cancelled');
  assert.equal((await ada('DELETE', `/bookings/${held.body.booking.id}`)).status, 409);

  const again = await bayo('POST', '/bookings', { ...stay, checkIn: '2027-03-10', checkOut: '2027-03-12' });
  assert.equal(again.status, 201);
});

test('an expired hold no longer blocks anyone', async () => {
  const ada = await newGuest();
  const bayo = await newGuest();
  const stay = { listingId: VI, checkIn: '2027-04-01', checkOut: '2027-04-04', guests: 1 };
  const held = await ada('POST', '/bookings', stay);
  assert.equal(held.status, 201);
  assert.equal((await bayo('POST', '/bookings', stay)).status, 409);

  // fast-forward: the hold ran out
  await pool.query('UPDATE bookings SET hold_expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [held.body.booking.id]);
  const search = await bayo('GET', '/listings?city=Lagos&checkin=2027-04-01&checkout=2027-04-04');
  assert.ok(search.body.listings.some(l => l.id === VI), 'search ignores expired holds');
  const mine = await ada('GET', '/bookings/mine');
  assert.equal(mine.body.bookings[0].status, 'expired');

  assert.equal((await bayo('POST', '/bookings', stay)).status, 201);
});

test('validation: guest limit, past dates, host blocks, hold limit', async () => {
  const c = await newGuest();
  const tooMany = await c('POST', '/bookings', { listingId: VI, checkIn: '2027-05-01', checkOut: '2027-05-02', guests: 3 });
  assert.equal(tooMany.status, 400);
  const past = await c('POST', '/bookings', { listingId: VI, checkIn: '2020-05-01', checkOut: '2020-05-02', guests: 1 });
  assert.equal(past.status, 400);
  const blocked = await c('POST', '/bookings', { listingId: LEKKI, checkIn: '2026-12-21', checkOut: '2026-12-23', guests: 2 });
  assert.equal(blocked.status, 409, 'seeded host block on Lekki');

  for (let i = 0; i < 3; i++) {
    const day = String(10 + i * 2).padStart(2, '0');
    const r = await c('POST', '/bookings', { listingId: 6, checkIn: `2027-06-${day}`, checkOut: `2027-06-${String(11 + i * 2)}`, guests: 1 });
    assert.equal(r.status, 201);
  }
  const fourth = await c('POST', '/bookings', { listingId: 6, checkIn: '2027-06-20', checkOut: '2027-06-21', guests: 1 });
  assert.equal(fourth.status, 409);
  assert.equal(fourth.body.error.code, 'too_many_holds');
});

test('paying is refused: payments are unavailable in this demo', async () => {
  const c = await newGuest();
  const held = await c('POST', '/bookings', { listingId: 5, checkIn: '2027-07-01', checkOut: '2027-07-03', guests: 2 });
  const pay = await c('POST', `/bookings/${held.body.booking.id}/pay`, {});
  assert.equal(pay.status, 503);
  assert.equal(pay.body.error.code, 'payments_unavailable');
  assert.equal(pay.body.error.message, 'Payment is unavailable — this is a demo project.');
});

test('concurrency: 20 guests race for the same nights — exactly one wins', async () => {
  const guests = await Promise.all(Array.from({ length: 20 }, newGuest));
  const stay = { listingId: 4, checkIn: '2027-08-14', checkOut: '2027-08-18', guests: 2 };

  const results = await Promise.all(guests.map(g => g('POST', '/bookings', stay)));
  const statuses = results.map(r => r.status);
  const won = statuses.filter(s => s === 201).length;
  const lost = statuses.filter(s => s === 409).length;

  assert.equal(won, 1, `expected 1 success, got ${statuses.join(',')}`);
  assert.equal(lost, 19);
  assert.ok(results.filter(r => r.status === 409).every(r => r.body.error.code === 'dates_unavailable'));

  const [[{ n }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM booking_nights WHERE listing_id = 4 AND night BETWEEN '2027-08-14' AND '2027-08-17'`);
  assert.equal(n, 4, 'exactly four nights claimed, all by the winner');
});

test('concurrency: overlapping (not identical) ranges also get exactly one winner per night', async () => {
  const guests = await Promise.all(Array.from({ length: 12 }, newGuest));
  // ranges that all share the night of 2027-09-05
  const ranges = guests.map((_, i) => ({ checkIn: `2027-09-0${1 + (i % 5)}`, checkOut: `2027-09-${String(6 + (i % 4)).padStart(2, '0')}` }));
  const results = await Promise.all(guests.map((g, i) => g('POST', '/bookings', { listingId: 7, guests: 2, ...ranges[i] })));
  assert.equal(results.filter(r => r.status === 201).length, 1, results.map(r => r.status).join(','));

  const [dupes] = await pool.query(
    `SELECT night, COUNT(*) c FROM booking_nights WHERE listing_id = 7 GROUP BY night HAVING c > 1`);
  assert.equal(dupes.length, 0);
});
