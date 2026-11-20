# Kundar Travel

**Live:** [kundar-travel.netlify.app](https://kundar-travel.netlify.app) · Host dashboard: [kundar-travel-host.netlify.app](https://kundar-travel-host.netlify.app) (demo login below) · API: [kundar-travel-api.onrender.com](https://kundar-travel-api.onrender.com/api/health)

A stays-booking site for places in **Lagos, Abuja, Ibadan and Port Harcourt**, based in Lagos and Abuja. It has three parts: a cinematic public site, an Express + MySQL API that rules out double bookings in the database itself, and a React dashboard where hosts run their places.

> **Demo project — payments are unavailable.** No payment provider is connected and no money is ever taken. See [Demo limitations](#demo-limitations).

## What it does

**Front end** (`web/`, plain HTML/CSS/JS, no build step)
- Three-slide hero with a misty right-to-left wipe, giant frosted titles and drifting clouds (generated in code on a canvas and screen-blended)
- Round destination thumbnails on concentric rings, with an animated caption
- Search bar with a date-range calendar, a guest picker and a city picker; searching asks the API which stays are free
- Card → detail page shared-element flight, with a booking card: dates carried over from the search (and changeable), a guest stepper capped at the listing's size, a nightly total, and nights that are already taken flagged straight away
- Log in / sign up dialog and an account menu (initials in the nav once you're signed in)
- **Book Now places a real 15-minute hold** with a live countdown. "Continue to payment" shows *"Payment is unavailable — this is a demo project."*, and you can release the dates or let the hold run out
- If someone else takes the dates first, the card says so and asks for different dates
- "My stays" drawer listing your holds with live countdowns, plus released and expired ones
- Fully responsive with no horizontal scroll; a custom cursor on desktop (add `?rec` to the URL for a larger cursor when screen-recording)
- If the API can't be reached, the site falls back to built-in listings, so the static site still works on its own

**Host dashboard** (`dashboard/`, React 18 + Vite)
- Log in as a host, or create a host account (a guest account can be upgraded)
- Overview: live holds, value on hold, holds in the last 30 days, blocked nights ahead
- Places: add a place, edit its details, upload photos (drag and drop), choose the cover photo, then publish or pause it. New places stay hidden until they have a photo and are published
- Calendar: two months side by side showing guest holds and your blocks. Click a first and last night to block dates; click a block to unblock it. Blocks use the same one-row-per-night guard as guest holds, so a host can't block over a live hold
- Guest holds: every Book Now on your places, with live countdowns

**Demo host login:** `adaeze@host.kundar.test` / `kundar-host-demo`. Adaeze runs the eight sample stays; the login page can fill this in for you.

**API** (`api/`, Node + Express 5 + MySQL)
- Listings search by city, dates and number of guests, returning only stays that are free for every night
- A listing's details and photos, and the nights it is unavailable (for greying out a calendar)
- Accounts with sign-up, log-in and log-out
- 15-minute booking holds, which guests can release; expired holds free their nights automatically
- Prices are stored in kobo as integers, and dates as plain calendar dates in Lagos time

## How double booking is prevented

Every booking also writes **one row per night** to `booking_nights`, whose primary key is `(listing_id, night)`:

```sql
CREATE TABLE booking_nights (
  listing_id INT UNSIGNED NOT NULL,
  night      DATE NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (listing_id, night),
  ...
);
```

A booking and its nights are inserted in one transaction. If two guests race for overlapping dates, the second insert hits a duplicate key (`ER_DUP_ENTRY`), its transaction rolls back, and the API answers **409 Conflict**. The guarantee comes from the database, not from a check in application code that two requests could both pass at the same moment. Check-out is exclusive, so one guest can leave the morning another arrives.

This is tested: 20 guests sending the same booking at the same moment get exactly **one 201 and nineteen 409s**, and a second test does the same with overlapping (not identical) date ranges. Booking transactions run at `READ COMMITTED` and retry on a deadlock, so a lost race always ends as a clean 409.

Host-blocked dates use the same table. When a hold expires or is cancelled, its nights are deleted and become free again. Search also ignores expired holds before they are swept up.

## Run locally

You need Node 22.9+ and MySQL 8+.

**1. Create the database and a user** (as MySQL root):

```sql
CREATE DATABASE kundar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kundar'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON kundar.* TO 'kundar'@'localhost';
```

**2. Configure, install and seed the API:**

```bash
cd api
cp .env.example .env        # then put your password in DB_PASSWORD
npm install
npm run db:seed             # rebuilds the tables and loads 8 listings + some blocked dates
npm run dev                 # http://localhost:4000
```

**3. Serve the front end** (in a second terminal, from the repo root):

```bash
python3 -m http.server 5180 --directory web
```

Then open http://localhost:5180. The API URL comes from `<meta name="kundar-api">` in `web/index.html`: `auto` uses the same hostname on port 4000 when running locally (so the login cookie counts as same-site); in production, put the API's full URL there.

**4. Start the host dashboard** (in a third terminal):

```bash
cd dashboard
npm install
npm run dev                 # http://localhost:5190
```

In development, Vite proxies `/api` and `/uploads` to the API on port 4000, so the dashboard's login cookie is same-origin.

**5. Run the tests** (optional). They use a separate `kundar_test` database, rebuilt on every run:

```sql
CREATE DATABASE kundar_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON kundar_test.* TO 'kundar'@'localhost';
```

```bash
cd api && npm test
```

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Database ping; reports `paymentsEnabled: false` |
| GET | `/api/listings?city=&checkin=&checkout=&guests=` | All filters optional; dates are `YYYY-MM-DD` and must be sent together (1–60 nights, not in the past) |
| GET | `/api/listings/:idOrSlug` | Details, host and photos |
| GET | `/api/listings/:idOrSlug/unavailable?from=&to=` | Booked or blocked nights in a range (default: the next 180 days) |
| POST | `/api/auth/signup` | `{ name, email, password }` → sets the session cookie |
| POST | `/api/auth/login` | `{ email, password }`; limited to 10 tries per 15 minutes |
| POST | `/api/auth/logout` | Ends the session |
| GET | `/api/auth/me` | `{ user }`, or `{ user: null }` when logged out |
| POST | `/api/bookings` | 🔒 `{ listingId, checkIn, checkOut, guests }` → **201** hold for 15 minutes, or **409** `dates_unavailable` |
| GET | `/api/bookings/mine` | 🔒 Your bookings: `held`, `expired` or `cancelled` |
| GET | `/api/bookings/:id` | 🔒 One of your bookings |
| DELETE | `/api/bookings/:id` | 🔒 Releases a hold and frees its nights |
| POST | `/api/bookings/:id/pay` | 🔒 Always **503** `payments_unavailable` in this demo |
| POST | `/api/auth/become-host` | 🔒 Turns a guest account into a host account |

🔒 = needs a logged-in session.

**Host endpoints** (host accounts only; a host only ever sees their own places, and other hosts' places return 404):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/host/summary` | Counts for the overview |
| GET | `/api/host/bookings?status=live` | Guest holds on your places |
| GET / POST | `/api/host/listings` | List your places / add one (starts paused) |
| GET / PATCH | `/api/host/listings/:id` | One place with photos / edit details, `status: active \| paused` (publishing needs a photo) |
| POST | `/api/host/listings/:id/photos` | Raw image body (JPEG, PNG or WebP, max 5 MB) with the `X-Kundar-Upload: 1` header |
| POST | `/api/host/listings/:id/photos/:photoId/cover` | Make a photo the cover |
| DELETE | `/api/host/listings/:id/photos/:photoId` | Remove a photo |
| GET | `/api/host/listings/:id/calendar?from=&to=` | Guest holds and blocks in a range |
| POST | `/api/host/listings/:id/blocks` | `{ checkIn, checkOut }` → **201**, or **409** if a night is already held or blocked |
| DELETE | `/api/host/blocks/:id` | Unblock |

Errors look like `{ "error": { "code": "bad_request", "message": "checkout must be after checkin" } }`.

## Security notes

- Passwords are hashed with scrypt (Node's built-in `crypto`), using a random salt per user.
- Sessions use a random token in an `HttpOnly`, `SameSite=Lax` cookie. Only the token's SHA-256 hash is stored, so a copy of the `sessions` table can't be used to log in.
- A failed login gives the same answer and takes about the same time whether or not the email exists.
- `POST`, `PUT` and `PATCH` requests must be `application/json`, and CORS only allows the site's own origin. Together with SameSite cookies, this stops other sites from forging requests (CSRF).
- Photo uploads are checked by their first bytes (not just the declared type), saved under random file names, and served with `X-Content-Type-Options: nosniff`. They need a custom header, which forces a CORS preflight, so other sites can't upload.
- When the site and API are on different domains in production, set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`.

## Demo limitations

- **Payments are unavailable.** There is no payment provider. Guests can hold dates for 15 minutes; pressing "Continue to payment" shows "Payment is unavailable — this is a demo project." Holds then expire on their own, or the guest releases them, and the nights free up again. Bookings never become confirmed. The payment step sits behind `PAYMENTS_ENABLED=false`, so a provider such as Paystack can be added later.
- Listings, the host and the reviews are fictional demo content.
- Host-uploaded photos are stored in MySQL (so they survive Render's temporary disk) and aren't resized. A busier site would put them on object storage or a CDN.

## Roadmap

1. ~~API, MySQL schema and seed; site reads listings and availability from the API~~ ✓
2. ~~Accounts (secure cookies), 15-minute holds, and a concurrency test (20 simultaneous requests → exactly 1 succeeds)~~ ✓
3. ~~Site: log-in, holding dates and the "Payment unavailable" step~~ ✓
4. ~~Host dashboard (React): listings and photos, blocking dates, viewing holds~~ ✓
5. Deploy: Netlify (web), Render (API), hosted MySQL

## Deploy (free tiers)

| Part | Host | Notes |
|---|---|---|
| Database | [TiDB Cloud Starter](https://www.pingcap.com/tidb-cloud-starter-pricing-details/) | Free, MySQL-compatible, needs TLS (`DB_SSL=true`), port 4000 |
| API | [Render](https://render.com/docs/free) free web service | `render.yaml` blueprint. Sleeps after 15 minutes idle and takes up to a minute to wake |
| Site | Netlify, base directory `web` | `web/netlify.toml` |
| Dashboard | Netlify, base directory `dashboard` | `dashboard/netlify.toml` |

Both Netlify sites **proxy `/api/*` and `/uploads/*` to the API**, so the browser only ever talks to its own domain. That keeps the login cookie first-party (Safari blocks third-party cookies) and means no CORS setup is needed. While the API is waking up, the site shows its built-in listings and retries, and the dashboard shows a "waking up" message. Host photos are stored in MySQL because Render's free disk is wiped on every restart.

**1. Database.** Create a TiDB Cloud Starter cluster. Under **Connect**, choose "General" and note the host, port (4000), user and password. Then create `api/.env.production` (it's gitignored):

```
DB_HOST=gateway01.xx-xxxx-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=xxxxxxxx.root
DB_PASSWORD=your-tidb-password
DB_NAME=kundar
DB_SSL=true
```

```bash
cd api && npm run db:seed:prod
```

**2. API.** In Render choose **New → Blueprint** and pick the repo. Fill in `DB_HOST`, `DB_USER` and `DB_PASSWORD` from step 1. Set `WEB_PUBLIC_URL` to the site's Netlify URL and `CORS_ORIGIN` to both Netlify URLs, comma-separated (you can fill these in after step 3). If the name `kundar-travel-api` is taken, update the API URL in both `netlify.toml` files.

**3. Site and dashboard.** In Netlify, **Add new site → Import an existing project** twice from the same repo: once with base directory `web`, once with base directory `dashboard`. For the dashboard, add the environment variable `VITE_SITE_URL` = the site's URL. Then put the dashboard's URL into `<meta name="kundar-dashboard">` in `web/index.html`, so "Become a host" points to it.

## Files

```
web/            front end (index.html, styles.css, app.js, img/)
api/src/        Express app: app.js, server.js, db.js, routes/, lib/
api/db/         schema.sql, seed-lib.js (shared with tests) and seed.js
api/test/       integration tests (node:test): guests, holds, races, host routes
dashboard/src/  React host dashboard (App.jsx, pages/, api.js, styles.css)
```

## Photo credits

All photos are downloaded into `web/img/`; nothing is hotlinked.

Photos from [Pexels](https://www.pexels.com) are used under the [Pexels License](https://www.pexels.com/license/) (free to use; attribution is not required but is given here).

| File | Subject | Photographer | Source |
|---|---|---|---|
| slide-lagos.jpg | Lagos skyline at sunset, from the lagoon | FERA | [Pexels 36602313](https://www.pexels.com/photo/36602313/) |
| slide-stay.jpg | Balcony overlooking Lagos | Ben Iwara | [Pexels 40845383](https://www.pexels.com/photo/40845383/) |
| slide-abuja.jpg | National Mosque, Abuja | Sadiq Ali | [Pexels 28375230](https://www.pexels.com/photo/28375230/) |
| thumb-lekki-bridge.jpg | Lekki–Ikoyi Link Bridge at night | Olasunkanmiariyo | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lekki_link_bridge_at_night.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| thumb-elegushi.jpg | Elegushi Beach coastline, Lagos | Ben Iwara | [Pexels 27857461](https://www.pexels.com/photo/27857461/) |
| thumb-zuma.jpg | Zuma Rock, near Abuja | Mukhtar Shuaib Mukhtar | [Pexels 36814806](https://www.pexels.com/photo/36814806/) |
| stay-1-*.jpg | Lekki Pool Terrace | Isaac Udoye | [Pexels 16791339](https://www.pexels.com/photo/16791339/) |
| stay-2-*.jpg | Ikoyi Lagoon Suite | Ben Iwara | [Pexels 40845384](https://www.pexels.com/photo/40845384/) |
| stay-3-*.jpg | Maitama Garden House | Taiye Salawu | [Pexels 38040969](https://www.pexels.com/photo/38040969/) |
| stay-4-*.jpg | Wuse Palm Court | yahaya ahmed | [Pexels 34432716](https://www.pexels.com/photo/34432716/) |
| stay-5-*.jpg | Asokoro Warm Loft | Mukhtar Shuaib Mukhtar | [Pexels 39854861](https://www.pexels.com/photo/39854861/) |
| stay-6-*.jpg | Bodija Reading Flat | Jagaba Denis | [Pexels 34631660](https://www.pexels.com/photo/34631660/) |
| stay-7-*.jpg | GRA Garden Duplex (a living room in Nigeria; not photographed in Port Harcourt) | Hammad Dikko | [Pexels 20019416](https://www.pexels.com/photo/20019416/) |
| stay-8-*.jpg | Victoria Island Sky Flat | Ebenezer Idowu | [Pexels 20430716](https://www.pexels.com/photo/20430716/) |
| interior-1.jpg | Living room and kitchen, Abuja | Mukhtar Shuaib Mukhtar | [Pexels 39854853](https://www.pexels.com/photo/39854853/) |
| interior-2.jpg | Bedroom | Taiye Salawu | [Pexels 36482935](https://www.pexels.com/photo/36482935/) |
| interior-3.jpg | Interior with wall art | Caio Mantovani | [Pexels 17905814](https://www.pexels.com/photo/17905814/) |
| avatar-1.jpg | Host portrait | Pexels contributor | [Pexels 39462600](https://www.pexels.com/photo/39462600/) |
| avatar-2.jpg | Reviewer portrait | Pexels contributor | [Pexels 3316263](https://www.pexels.com/photo/3316263/) |
| avatar-3.jpg | Reviewer portrait | Pexels contributor | [Pexels 36322505](https://www.pexels.com/photo/36322505/) |
| avatar-4.jpg | Reviewer portrait | Pexels contributor | [Pexels 21222664](https://www.pexels.com/photo/21222664/) |

The listings, host and reviews are fictional demo content. The clouds are generated procedurally in `app.js`, so no cloud photo is used.
