import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { naira, plural } from '../format.js';

export default function Listings() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/host/listings').then(r => setRows(r.listings)).catch(err => setError(err.message));
  }, []);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Your places</h1>
          <p className="muted">Edit details and photos, pause a place, or block dates on its calendar.</p>
        </div>
        <Link className="btn" to="/listings/new">Add a place</Link>
      </header>
      {error && <p className="err">{error}</p>}
      {!rows ? <p className="muted">Loading…</p> : !rows.length ? (
        <div className="empty">
          <h2>No places yet</h2>
          <p className="muted">Add your first place. It stays hidden from guests until you add a photo and publish it.</p>
          <Link className="btn" to="/listings/new">Add a place</Link>
        </div>
      ) : (
        <div className="lgrid">
          {rows.map(l => (
            <Link key={l.id} to={`/listings/${l.id}`} className="lcard">
              <div className="lcard-img">{l.cover ? <img src={l.cover} alt="" /> : <span>No photo yet</span>}</div>
              <div className="lcard-body">
                <div className="lcard-top">
                  <h3>{l.name}</h3>
                  <span className={`chip ${l.status}`}>{l.status === 'active' ? 'Live' : 'Paused'}</span>
                </div>
                <p className="muted">{l.area}</p>
                <p className="lcard-meta">
                  <b>{naira(l.price)}</b> a night · sleeps {l.maxGuests}
                  {l.liveHolds > 0 && <> · <span className="hot">{plural(l.liveHolds, 'live hold')}</span></>}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
