import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { naira, dateRange, plural, timeLeft } from '../format.js';

/** Re-renders every second so countdowns stay live. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(n => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

const STATUS = { held: 'On hold', expired: 'Expired', cancelled: 'Released by guest', confirmed: 'Confirmed' };

export function HoldRow({ b }) {
  const live = b.status === 'held' && new Date(b.holdExpiresAt) > Date.now();
  const status = b.status === 'held' && !live ? 'expired' : b.status;
  return (
    <tr>
      <td data-label="Guest">{b.guest || 'Guest'}<small>{plural(b.guests, 'guest')}</small></td>
      <td data-label="Place"><Link to={`/listings/${b.listing.id}`}>{b.listing.name}</Link></td>
      <td data-label="Dates">{dateRange(b.checkIn, b.checkOut)}<small>{plural(b.nights, 'night')}</small></td>
      <td data-label="Total">{naira(b.total)}</td>
      <td data-label="Status"><span className={`chip ${status}`}>{live ? `On hold · ${timeLeft(b.holdExpiresAt)}` : STATUS[status]}</span></td>
    </tr>
  );
}

export default function Holds() {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useTick();

  useEffect(() => {
    setRows(null);
    api(`/api/host/bookings${filter === 'live' ? '?status=live' : ''}`)
      .then(r => setRows(r.bookings))
      .catch(err => setError(err.message));
  }, [filter]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Guest holds</h1>
          <p className="muted">Every time a guest presses Book Now on one of your places. Payments are off in this demo, so holds end after 15 minutes.</p>
        </div>
      </header>
      <div className="seg small">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'live' ? 'on' : ''} onClick={() => setFilter('live')}>On hold now</button>
      </div>
      {error && <p className="err">{error}</p>}
      {!rows ? <p className="muted">Loading…</p> : rows.length ? (
        <section className="card-block">
          <table className="table">
            <thead><tr><th>Guest</th><th>Place</th><th>Dates</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>{rows.map(b => <HoldRow key={b.id} b={b} />)}</tbody>
          </table>
        </section>
      ) : <p className="muted">{filter === 'live' ? 'Nobody is holding dates right now.' : 'No holds yet.'}</p>}
    </>
  );
}
