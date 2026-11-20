import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { naira, plural } from '../format.js';
import { HoldRow, useTick } from './Holds.jsx';

export default function Overview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [holds, setHolds] = useState([]);
  const [error, setError] = useState('');
  useTick();

  useEffect(() => {
    Promise.all([api('/api/host/summary'), api('/api/host/bookings')])
      .then(([s, b]) => { setData(s); setHolds(b.bookings.slice(0, 6)); })
      .catch(err => setError(err.message));
  }, []);

  const first = user.name.split(' ')[0];
  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const s = data.summary;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Good to see you, {first}</h1>
          <p className="muted">{plural(s.activeListings, 'place')} live on Kundar Travel{s.listings > s.activeListings ? `, ${s.listings - s.activeListings} paused` : ''}.</p>
        </div>
        <Link className="btn" to="/listings/new">Add a place</Link>
      </header>

      {!data.paymentsEnabled && (
        <p className="note">Payments are unavailable in this demo, so guests can only hold dates. Each hold lasts 15 minutes and then the nights free up again.</p>
      )}

      <section className="stats">
        <Stat label="Guests holding dates now" value={s.liveHolds} />
        <Stat label="Value of live holds" value={naira(s.heldValue)} />
        <Stat label="Holds in the last 30 days" value={s.holdsLast30Days} />
        <Stat label="Nights you’ve blocked ahead" value={s.upcomingBlockedNights} />
      </section>

      <section className="card-block">
        <div className="block-head">
          <h2>Recent guest holds</h2>
          <Link to="/holds" className="linkish">See all</Link>
        </div>
        {holds.length ? (
          <table className="table">
            <thead><tr><th>Guest</th><th>Place</th><th>Dates</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>{holds.map(b => <HoldRow key={b.id} b={b} />)}</tbody>
          </table>
        ) : (
          <p className="muted">No holds yet. When a guest presses Book Now on one of your places, it shows up here.</p>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><b>{value}</b></div>;
}

