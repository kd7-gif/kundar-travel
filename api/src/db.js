import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'kundar',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kundar',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  dateStrings: true,          // DATE/DATETIME come back as strings: no timezone drift on calendar dates
  timezone: '+01:00',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

// Every connection uses Lagos time, so NOW() and hold expiry line up with the calendar.
pool.on('connection', conn => { conn.query("SET time_zone = '+01:00'"); });

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
