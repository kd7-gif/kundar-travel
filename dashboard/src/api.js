// Thin fetch wrapper. In dev, Vite proxies /api to the API; in production set VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const raw = body instanceof Blob;
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !raw && { 'Content-Type': 'application/json' }),
      ...headers
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.code, data.error?.message || `Request failed (${res.status})`);
  return data;
}

export const uploadPhoto = (listingId, file) => api(`/api/host/listings/${listingId}/photos`, {
  method: 'POST',
  body: file,
  headers: { 'Content-Type': file.type, 'X-Kundar-Upload': '1' }
});

export const SITE_URL = import.meta.env.VITE_SITE_URL || `${location.protocol}//${location.hostname}:5180`;
