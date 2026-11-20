export const naira = n => '₦' + Number(n).toLocaleString('en-NG');

const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const toIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shortDate = s => fromIso(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const longDate = s => fromIso(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateRange = (a, b) => `${shortDate(a)} – ${longDate(b)}`;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'ended';
  const t = Math.ceil(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} left`;
}
