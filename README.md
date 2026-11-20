# Kundar Travel

A stays-booking site for places in **Lagos, Abuja, Ibadan and Port Harcourt**, based in Lagos and Abuja. It has a cinematic front end and an Express + MySQL API that rules out double bookings in the database itself.

> **Demo project — payments are unavailable.** No payment provider is connected and no money is ever taken. See [Demo limitations](#demo-limitations).

## What it does

**Front end** (`web/`, plain HTML/CSS/JS, no build step)
- Three-slide hero with a misty right-to-left wipe, giant frosted titles and drifting clouds (generated in code on a canvas and screen-blended)
- Round destination thumbnails on concentric rings, with an animated caption
- Search bar with a date-range calendar, a guest picker and a city picker; searching asks the API which stays are free
- Card → detail page shared-element flight, with a booking card (dates carried over from the search, guest stepper capped at the listing's size, nightly total)
- Fully responsive with no horizontal scroll; a custom cursor on desktop (add `?rec` to the URL for a larger cursor when screen-recording)
- If the API can't be reached, the site falls back to built-in listings, so the static site still works on its own

**API** (`api/`, Node + Express 5 + MySQL)
- Listings search by city, dates and number of guests, returning only stays that are free for every night
- A listing's details and photos, and the nights it is unavailable (for greying out a calendar)
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

Then open http://localhost:5180. The API URL comes from `<meta name="kundar-api">` in `web/index.html`.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Database ping; reports `paymentsEnabled: false` |
| GET | `/api/listings?city=&checkin=&checkout=&guests=` | All filters optional; dates are `YYYY-MM-DD` and must be sent together (1–60 nights, not in the past) |
| GET | `/api/listings/:idOrSlug` | Details, host and photos |
| GET | `/api/listings/:idOrSlug/unavailable?from=&to=` | Booked or blocked nights in a range (default: the next 180 days) |

Errors look like `{ "error": { "code": "bad_request", "message": "checkout must be after checkin" } }`.

## Demo limitations

- **Payments are unavailable.** There is no payment provider. When booking is added, guests can hold dates for 15 minutes, then see "Payment is unavailable — this is a demo project." Holds expire on their own and the nights free up again. The payment step sits behind `PAYMENTS_ENABLED=false`, so a provider such as Paystack can be added later.
- Listings, the host and the reviews are fictional demo content.

## Roadmap

1. ~~API, MySQL schema and seed; site reads listings and availability from the API~~ ✓
2. Accounts (secure cookies), 15-minute holds, and a concurrency test (20 simultaneous requests → exactly 1 succeeds)
3. "Payment unavailable" step on the site
4. Host dashboard (React): listings and photos, blocking dates, viewing holds
5. Deploy: Netlify (web), Render (API), hosted MySQL

## Deploy the front end (Netlify)

Import the GitHub repo in Netlify, leave the build command empty and set the publish directory to `web`.

## Files

```
web/            front end (index.html, styles.css, app.js, img/)
api/src/        Express app: app.js, server.js, db.js, routes/, lib/
api/db/         schema.sql and seed.js
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
