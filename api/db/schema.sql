-- Kundar Travel — MySQL schema
-- Money is stored in kobo (₦1 = 100 kobo) as integers. Dates are calendar dates (Africa/Lagos).

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS photo_files;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS booking_nights;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS listing_photos;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,            -- NULL = cannot log in (seeded reviewers)
  role          ENUM('guest','host','admin') NOT NULL DEFAULT 'guest',
  avatar_url    VARCHAR(255) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login sessions. The browser holds a random token in an HttpOnly cookie;
-- only its SHA-256 hash is stored, so a leaked table can't be replayed.
CREATE TABLE sessions (
  id         CHAR(64) PRIMARY KEY,              -- sha256(token), hex
  user_id    INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE listings (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  host_id      INT UNSIGNED NOT NULL,
  slug         VARCHAR(120) NOT NULL UNIQUE,
  name         VARCHAR(120) NOT NULL,
  city         ENUM('Lagos','Abuja','Ibadan','Port Harcourt') NOT NULL,
  area         VARCHAR(120) NOT NULL,
  type         ENUM('Apartments','Houses','Villas') NOT NULL,
  price_kobo   INT UNSIGNED NOT NULL,
  max_guests   TINYINT UNSIGNED NOT NULL,
  about        TEXT NOT NULL,
  rating       DECIMAL(2,1) NOT NULL DEFAULT 0.0,
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  status       ENUM('active','paused') NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_listing_host FOREIGN KEY (host_id) REFERENCES users(id),
  INDEX idx_listing_city (city, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE listing_photos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id INT UNSIGNED NOT NULL,
  url_small  VARCHAR(255) NOT NULL,           -- ~700px, used on cards
  url_large  VARCHAR(255) NOT NULL,           -- ~1400px, used on the detail page
  alt        VARCHAR(200) NOT NULL DEFAULT '',
  position   TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0 = cover
  CONSTRAINT fk_photo_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  INDEX idx_photo_listing (listing_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Photos uploaded by hosts are stored in the database, so they survive on hosts
-- with a temporary disk (e.g. Render's free plan). Served at /uploads/<name>.
CREATE TABLE photo_files (
  name       VARCHAR(80) PRIMARY KEY,
  mime       VARCHAR(30) NOT NULL,
  bytes      MEDIUMBLOB NOT NULL,           -- uploads are capped at 5 MB by the API
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A booking is either a guest stay or a host block.
-- Payments are disabled in this demo, so guest stays stay 'held' until they expire or are cancelled.
-- 'confirmed' is used for host blocks (and for paid stays if payments are ever enabled).
CREATE TABLE bookings (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id      INT UNSIGNED NOT NULL,
  guest_id        INT UNSIGNED NULL,
  kind            ENUM('stay','block') NOT NULL DEFAULT 'stay',
  check_in        DATE NOT NULL,
  check_out       DATE NOT NULL,              -- exclusive: the guest leaves this morning
  guests          TINYINT UNSIGNED NOT NULL DEFAULT 1,
  total_kobo      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status          ENUM('held','confirmed','cancelled','expired') NOT NULL DEFAULT 'held',
  hold_expires_at DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_listing FOREIGN KEY (listing_id) REFERENCES listings(id),
  CONSTRAINT fk_booking_guest   FOREIGN KEY (guest_id)   REFERENCES users(id),
  CONSTRAINT chk_booking_dates  CHECK (check_out > check_in),
  INDEX idx_booking_listing (listing_id, status),
  INDEX idx_booking_hold (status, hold_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The double-booking guard: one row per occupied night, and the primary key
-- makes each (listing, night) pair unique. Two overlapping bookings cannot both
-- insert their nights — the second one fails with ER_DUP_ENTRY and is rolled back.
-- Rows are deleted when a booking is cancelled or expires, which frees the nights.
CREATE TABLE booking_nights (
  listing_id INT UNSIGNED NOT NULL,
  night      DATE NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (listing_id, night),
  CONSTRAINT fk_night_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_night_listing FOREIGN KEY (listing_id) REFERENCES listings(id),
  INDEX idx_night_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reviews (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  rating     TINYINT UNSIGNED NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  INDEX idx_review_listing (listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
