// Host dashboard API tests (same kundar_test database, rebuilt before the run).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.DB_NAME = process.env.TEST_DB_NAME || 'kundar_test';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.UPLOAD_DIR = new URL('../uploads-test', import.meta.url).pathname;

const { seed, defaultConfig, DEMO_HOST } = await import('../db/seed-lib.js');
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

let server, base;
before(async () => {
  await seed(defaultConfig(), { quiet: true });
  server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(r => server.close(r));
  await pool.end();
});

function client() {
  let cookie = '';
  return async (method, path, body, headers = {}) => {
    const isRaw = body instanceof Uint8Array;
    const res = await fetch(base + '/api' + path, {
      method,
      headers: { ...(body !== undefined && !isRaw && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...headers },
      body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body)
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}

const NEW_LISTING = {
  name: 'Gbagada Garden Flat', city: 'Lagos', area: 'Gbagada, Lagos', type: 'Apartments', price: 55000, maxGuests: 3,
  about: 'A quiet two-bedroom flat with a small garden, ten minutes from the Third Mainland Bridge and close to good bukas.'
};
// 1x1 JPEG
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

async function hostLogin() {
  const c = client();
  const r = await c('POST', '/auth/login', DEMO_HOST);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'host');
  return c;
}

test('guests cannot use host routes; a guest can become a host', async () => {
  const g = client();
  await g('POST', '/auth/signup', { name: 'Guest Person', email: `g${Date.now()}@example.test`, password: 'guest-pass-1' });
  assert.equal((await g('GET', '/host/listings')).status, 403);
  assert.equal((await client()('GET', '/host/listings')).status, 401);
  const up = await g('POST', '/auth/become-host', {});
  assert.equal(up.body.user.role, 'host');
  const mine = await g('GET', '/host/listings');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.listings.length, 0, 'a new host sees no one else’s listings');
});

test('the demo host sees their 8 listings and a summary', async () => {
  const h = await hostLogin();
  const l = await h('GET', '/host/listings');
  assert.equal(l.body.listings.length, 8);
  assert.ok(l.body.listings[0].cover.startsWith('http://'), 'dashboard gets absolute image URLs');
  const s = await h('GET', '/host/summary');
  assert.equal(s.body.summary.listings, 8);
  assert.equal(s.body.paymentsEnabled, false);
});

test('create → upload photo → publish; the public site then lists it', async () => {
  const h = await hostLogin();
  const bad = await h('POST', '/host/listings', { ...NEW_LISTING, price: 12 });
  assert.equal(bad.status, 400);

  const created = await h('POST', '/host/listings', NEW_LISTING);
  assert.equal(created.status, 201);
  const id = created.body.listing.id;
  assert.equal(created.body.listing.status, 'paused');
  assert.equal(created.body.listing.slug, 'gbagada-garden-flat-gbagada');

  const noPhoto = await h('PATCH', `/host/listings/${id}`, { status: 'active' });
  assert.equal(noPhoto.status, 400, 'cannot publish without a photo');

  const notImage = await h('POST', `/host/listings/${id}/photos`, new Uint8Array(Buffer.from('<svg></svg>')), { 'Content-Type': 'image/png', 'X-Kundar-Upload': '1' });
  assert.equal(notImage.status, 400, 'content is sniffed, not trusted');
  const noHeader = await h('POST', `/host/listings/${id}/photos`, new Uint8Array(JPEG), { 'Content-Type': 'image/jpeg' });
  assert.equal(noHeader.status, 415);
  const up = await h('POST', `/host/listings/${id}/photos`, new Uint8Array(JPEG), { 'Content-Type': 'image/jpeg', 'X-Kundar-Upload': '1' });
  assert.equal(up.status, 201);
  assert.match(up.body.photos[0].url, /\/uploads\/\d+-[0-9a-f]{16}\.jpg$/);
  const file = await fetch(up.body.photos[0].url.replace(/^http:\/\/localhost:\d+/, base));
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');

  const pub = await h('PATCH', `/host/listings/${id}`, { status: 'active', price: 60000 });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.listing.price, 60000);

  const site = await client()('GET', '/listings?city=Lagos');
  const mine = site.body.listings.find(l => l.id === id);
  assert.ok(mine, 'published listing appears on the site');
  assert.ok(mine.image.small.includes('/uploads/'));

  // last photo of a published listing can't be removed
  const del = await h('DELETE', `/host/listings/${id}/photos/${up.body.photos[0].id}`);
  assert.equal(del.status, 400);
});

test('hosts can only touch their own listings', async () => {
  const other = client();
  await other('POST', '/auth/signup', { name: 'Other Host', email: `h${Date.now()}@example.test`, password: 'host-pass-1', asHost: true });
  assert.equal((await other('GET', '/host/listings/1')).status, 404);
  assert.equal((await other('PATCH', '/host/listings/1', { price: 1 })).status, 404);
  assert.equal((await other('POST', '/host/listings/1/blocks', { checkIn: '2027-10-01', checkOut: '2027-10-03' })).status, 404);
});

test('blocking dates uses the same nights guard as guest holds', async () => {
  const h = await hostLogin();
  const g = client();
  await g('POST', '/auth/signup', { name: 'Guest Two', email: `g2${Date.now()}@example.test`, password: 'guest-pass-2' });
  const hold = await g('POST', '/bookings', { listingId: 5, checkIn: '2027-10-10', checkOut: '2027-10-13', guests: 2 });
  assert.equal(hold.status, 201);

  const clash = await h('POST', '/host/listings/5/blocks', { checkIn: '2027-10-12', checkOut: '2027-10-15' });
  assert.equal(clash.status, 409, 'cannot block over a live guest hold');

  const ok = await h('POST', '/host/listings/5/blocks', { checkIn: '2027-10-13', checkOut: '2027-10-16' });
  assert.equal(ok.status, 201);
  assert.equal((await g('POST', '/bookings', { listingId: 5, checkIn: '2027-10-15', checkOut: '2027-10-17', guests: 1 })).status, 409);

  const cal = await h('GET', '/host/listings/5/calendar?from=2027-10-01&to=2027-11-01');
  assert.deepEqual(cal.body.entries.map(e => e.kind), ['stay', 'block']);
  assert.equal(cal.body.entries[0].guest, 'Guest Two');

  const live = await h('GET', '/host/bookings?status=live');
  assert.ok(live.body.bookings.some(b => b.id === hold.body.booking.id));

  assert.equal((await h('DELETE', `/host/blocks/${ok.body.block.id}`)).status, 204);
  assert.equal((await g('POST', '/bookings', { listingId: 5, checkIn: '2027-10-15', checkOut: '2027-10-17', guests: 1 })).status, 201);
  assert.equal((await h('DELETE', `/host/blocks/${hold.body.booking.id}`)).status, 404, 'a guest hold is not a block');
});
