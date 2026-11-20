// Password hashing with Node's built-in scrypt (no native dependencies).
// Stored format: scrypt$N$r$p$<salt base64>$<hash base64>
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384, R = 8, P = 1, KEYLEN = 64;

const derive = (password, salt, n, r, p) => new Promise((resolve, reject) =>
  scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}
