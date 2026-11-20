// Rebuilds the database from schema.sql and loads demo data.
// Usage: npm run db:seed   (reads api/.env)
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { insertBookingWithNights } from '../src/lib/nights.js';

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'kundar',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kundar',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  multipleStatements: true,
  dateStrings: true
};

const HOST = { name: 'Adaeze Okafor', email: 'adaeze@host.kundar.test', role: 'host', avatar: 'img/avatar-1.jpg' };
const REVIEWERS = [
  { name: 'Tunde Bakare', email: 'tunde@guest.kundar.test', avatar: 'img/avatar-2.jpg' },
  { name: 'Halima Yusuf', email: 'halima@guest.kundar.test', avatar: 'img/avatar-3.jpg' },
  { name: 'Femi Adeyemi', email: 'femi@guest.kundar.test', avatar: 'img/avatar-4.jpg' }
];

const INTERIORS = [
  ['img/interior-1.jpg', 'Living room and kitchen'],
  ['img/interior-2.jpg', 'Bedroom'],
  ['img/interior-3.jpg', 'Lounge with wall art']
];

const LISTINGS = [
  { slug: 'lekki-pool-terrace', name: 'Lekki Pool Terrace', city: 'Lagos', area: 'Lekki Phase 1, Lagos', type: 'Apartments', price: 185000, guests: 6, rating: 4.9, reviews: 142, img: 'stay-1',
    about: 'A bright two-bedroom with its own plunge pool and a deep terrace, tucked into a quiet close off Admiralty Way. The canopy walk at Lekki Conservation Centre and the sand at Elegushi Beach are both a short drive away. In the evening there is suya from the corner spot, a swim under the palms, and the Link Bridge lighting up across the water.' },
  { slug: 'ikoyi-lagoon-suite', name: 'Ikoyi Lagoon Suite', city: 'Lagos', area: 'Ikoyi, Lagos', type: 'Apartments', price: 150000, guests: 3, rating: 4.8, reviews: 128, img: 'stay-2',
    about: 'A high-floor suite with a glass balcony that looks straight over the Lagos lagoon to the Lekki–Ikoyi Link Bridge. Awolowo Road’s cafés and boutiques are minutes away, and Falomo is close for an easy run to Victoria Island. Mornings are slow coffee on the balcony while the ferries cut across the water.' },
  { slug: 'maitama-garden-house', name: 'Maitama Garden House', city: 'Abuja', area: 'Maitama, Abuja', type: 'Houses', price: 240000, guests: 8, rating: 4.9, reviews: 96, img: 'stay-3',
    about: 'A four-bedroom family house on a leafy Maitama street, with a walled garden and a shaded veranda made for long lunches. Millennium Park is close by for evening walks, and on clear days Aso Rock fills the view on the drive home. Great for families and small teams visiting the capital.' },
  { slug: 'wuse-palm-court', name: 'Wuse Palm Court', city: 'Abuja', area: 'Wuse II, Abuja', type: 'Apartments', price: 95000, guests: 4, rating: 4.7, reviews: 211, img: 'stay-4',
    about: 'Calm serviced apartments set around a palm-lined courtyard in the middle of Wuse II. Restaurants and lounges on Aminu Kano Crescent are a short walk away, and Banex Plaza and Wuse Market are close for shopping. A practical base for work trips with reliable power and fast Wi-Fi.' },
  { slug: 'asokoro-warm-loft', name: 'Asokoro Warm Loft', city: 'Abuja', area: 'Asokoro, Abuja', type: 'Apartments', price: 120000, guests: 3, rating: 4.8, reviews: 74, img: 'stay-5',
    about: 'An open-plan loft in warm wood and linen, in one of Abuja’s quietest districts at the foot of Aso Rock. The dining nook catches the late light, and the bedroom is tucked away for proper rest. It is ten minutes to the city centre and an easy run to the airport road.' },
  { slug: 'bodija-reading-flat', name: 'Bodija Reading Flat', city: 'Ibadan', area: 'Bodija, Ibadan', type: 'Apartments', price: 45000, guests: 2, rating: 4.7, reviews: 58, img: 'stay-6',
    about: 'A cosy flat lined with books and soft lamps, close to Bodija Market and a short ride to the University of Ibadan. Spend a morning at Agodi Gardens, then head to Dugbe to see Cocoa House, the city’s old landmark. Ideal for long stays, writers and visiting family.' },
  { slug: 'gra-garden-duplex', name: 'GRA Garden Duplex', city: 'Port Harcourt', area: 'Old GRA, Port Harcourt', type: 'Houses', price: 130000, guests: 6, rating: 4.8, reviews: 67, img: 'stay-7',
    about: 'A three-bedroom duplex on a tree-lined street in Old GRA, with a gated compound and parking for two cars. Isaac Boro Park and the city’s best boli-and-fish spots are close by. The house has a generator and inverter backup, so the AC keeps humming through the night.' },
  { slug: 'victoria-island-sky-flat', name: 'Victoria Island Sky Flat', city: 'Lagos', area: 'Victoria Island, Lagos', type: 'Apartments', price: 160000, guests: 2, rating: 4.9, reviews: 183, img: 'stay-8',
    about: 'A sleek one-bedroom high in a Victoria Island tower, with city lights to the north and the Atlantic to the south. Eko Atlantic’s new waterfront is a few minutes away, and boats to Tarkwa Bay leave from the nearby jetty. Comes with a concierge, a gym and a rooftop pool.' }
];

// Host-blocked dates (confirmed), so availability search has something to filter.
const BLOCKS = [
  { slug: 'lekki-pool-terrace',   checkIn: '2026-12-20', checkOut: '2026-12-27' },
  { slug: 'maitama-garden-house', checkIn: '2026-12-22', checkOut: '2027-01-03' },
  { slug: 'ikoyi-lagoon-suite',   checkIn: '2026-12-31', checkOut: '2027-01-02' },
  { slug: 'bodija-reading-flat',  checkIn: '2026-12-05', checkOut: '2026-12-12' }
];

const REVIEW_LINES = [
  [5, 'Spotless, quiet and exactly like the photos. Power never went off once.'],
  [5, 'Adaeze was quick to reply and the check-in was easy. Would stay again.'],
  [4, 'Great location. Traffic at rush hour is real, so plan around it.']
];

const conn = await mysql.createConnection(cfg);
try {
  await conn.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await conn.beginTransaction();

  const [h] = await conn.query('INSERT INTO users (name, email, role, avatar_url) VALUES (?, ?, ?, ?)',
    [HOST.name, HOST.email, HOST.role, HOST.avatar]);
  const hostId = h.insertId;
  const reviewerIds = [];
  for (const r of REVIEWERS) {
    const [u] = await conn.query('INSERT INTO users (name, email, role, avatar_url) VALUES (?, ?, ?, ?)',
      [r.name, r.email, 'guest', r.avatar]);
    reviewerIds.push(u.insertId);
  }

  const ids = {};
  for (const l of LISTINGS) {
    const [res] = await conn.query(
      `INSERT INTO listings (host_id, slug, name, city, area, type, price_kobo, max_guests, about, rating, review_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [hostId, l.slug, l.name, l.city, l.area, l.type, l.price * 100, l.guests, l.about, l.rating, l.reviews]
    );
    ids[l.slug] = res.insertId;
    const photos = [[`img/${l.img}-700.jpg`, `img/${l.img}-1400.jpg`, `${l.name}, ${l.area}`, 0],
      ...INTERIORS.map(([url, alt], i) => [url, url, alt, i + 1])];
    await conn.query('INSERT INTO listing_photos (url_small, url_large, alt, position, listing_id) VALUES ?',
      [photos.map(p => [...p, res.insertId])]);
    await conn.query('INSERT INTO reviews (listing_id, user_id, rating, body) VALUES ?',
      [REVIEW_LINES.map(([rating, body], i) => [res.insertId, reviewerIds[i], rating, body])]);
  }

  for (const b of BLOCKS) {
    await insertBookingWithNights(conn, { listingId: ids[b.slug], kind: 'block', status: 'confirmed', checkIn: b.checkIn, checkOut: b.checkOut });
  }

  await conn.commit();
  const [[c]] = await conn.query('SELECT (SELECT COUNT(*) FROM listings) AS listings, (SELECT COUNT(*) FROM booking_nights) AS blocked_nights');
  console.log(`Seeded ${c.listings} listings and ${c.blocked_nights} blocked nights.`);
} catch (err) {
  await conn.rollback().catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await conn.end();
}
