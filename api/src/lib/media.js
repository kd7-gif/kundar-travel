// Turns stored photo paths into URLs the browser can load.
//   'uploads/…'  → files uploaded by hosts, served by this API
//   'img/…'      → the demo photos that ship with the website (web/img)
//   'https://…'  → already absolute (e.g. a CDN), left alone
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

const apiBase = () => (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const webBase = () => (process.env.WEB_PUBLIC_URL || 'http://localhost:5180').replace(/\/$/, '');

/** audience 'web' = the public site (img/ paths stay relative); 'dashboard' = another origin. */
export function mediaUrl(p, audience = 'web') {
  if (!p) return p;
  if (/^https?:\/\//.test(p)) return p;
  if (p.startsWith('uploads/')) return `${apiBase()}/${p}`;
  return audience === 'web' ? p : `${webBase()}/${p}`;
}

/** Recognises JPEG / PNG / WebP from their first bytes (never trust the Content-Type alone). */
export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
