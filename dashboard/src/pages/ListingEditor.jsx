import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, uploadPhoto, SITE_URL } from '../api.js';
import { naira, toIso, longDate, shortDate, plural, timeLeft } from '../format.js';
import { useTick } from './Holds.jsx';

const CITIES = ['Lagos', 'Abuja', 'Ibadan', 'Port Harcourt'];
const TYPES = ['Apartments', 'Houses', 'Villas'];
const EMPTY = { name: '', city: 'Lagos', area: '', type: 'Apartments', price: '', maxGuests: 2, about: '' };

export default function ListingEditor() {
  const { id } = useParams();
  const isNew = !id;
  const [params, setParams] = useSearchParams();
  const tab = isNew ? 'details' : params.get('tab') || 'details';
  const [listing, setListing] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) { setListing(null); return; }
    api(`/api/host/listings/${id}`).then(r => setListing(r.listing)).catch(err => setError(err.message));
  }, [id, isNew]);

  if (error) return <><Back /><p className="err">{error}</p></>;
  if (!isNew && !listing) return <p className="muted">Loading…</p>;

  const setTab = t => setParams(t === 'details' ? {} : { tab: t }, { replace: true });

  return (
    <>
      <Back />
      <header className="page-head">
        <div>
          <h1>{isNew ? 'Add a place' : listing.name}</h1>
          {!isNew && <p className="muted">{listing.area} · {naira(listing.price)} a night</p>}
        </div>
        {!isNew && <Publish listing={listing} onChange={setListing} goPhotos={() => setTab('photos')} />}
      </header>

      {!isNew && (
        <div className="tabs-row">
          {['details', 'photos', 'calendar'].map(t => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'details' ? 'Details' : t === 'photos' ? `Photos (${listing.photos.length})` : 'Calendar'}
            </button>
          ))}
        </div>
      )}

      {tab === 'details' && <Details listing={listing} onSaved={setListing} />}
      {tab === 'photos' && <Photos listing={listing} onChange={photos => setListing(l => ({ ...l, photos, cover: photos[0]?.thumb ?? null }))} />}
      {tab === 'calendar' && <Calendar listing={listing} />}
    </>
  );
}

function Back() {
  return <Link to="/listings" className="back">← All places</Link>;
}

function Publish({ listing, onChange, goPhotos }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const live = listing.status === 'active';

  async function toggle() {
    if (!live && !listing.photos.length) { setMsg('Add a photo first.'); goPhotos(); return; }
    setBusy(true); setMsg('');
    try {
      const r = await api(`/api/host/listings/${listing.id}`, { method: 'PATCH', body: { status: live ? 'paused' : 'active' } });
      onChange(r.listing);
    } catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="publish">
      <span className={`chip ${listing.status}`}>{live ? 'Live on the site' : 'Paused — hidden from guests'}</span>
      {live && <a className="linkish" href={`${SITE_URL}/#stay-${listing.id}`} target="_blank" rel="noreferrer">View on site</a>}
      <button className={`btn ${live ? 'ghost' : ''}`} disabled={busy} onClick={toggle}>{live ? 'Pause' : 'Publish'}</button>
      {msg && <span className="err inline">{msg}</span>}
    </div>
  );
}

/* ---------------- details ---------------- */

function Details({ listing, onSaved }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => listing ? {
    name: listing.name, city: listing.city, area: listing.area, type: listing.type,
    price: listing.price, maxGuests: listing.maxGuests, about: listing.about
  } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = k => e => { setSaved(false); setForm(f => ({ ...f, [k]: e.target.value })); };

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setSaved(false);
    const body = { ...form, price: Number(form.price), maxGuests: Number(form.maxGuests) };
    try {
      if (listing) {
        const r = await api(`/api/host/listings/${listing.id}`, { method: 'PATCH', body });
        onSaved(r.listing);
        setSaved(true);
      } else {
        const r = await api('/api/host/listings', { method: 'POST', body });
        navigate(`/listings/${r.listing.id}?tab=photos`, { replace: true });
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form className="card-block form" onSubmit={submit} noValidate>
      <label className="fld wide">Name of the place<input value={form.name} onChange={set('name')} placeholder="e.g. Gbagada Garden Flat" /></label>
      <label className="fld">City
        <select value={form.city} onChange={set('city')}>{CITIES.map(c => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="fld">Area<input value={form.area} onChange={set('area')} placeholder="e.g. Gbagada, Lagos" /></label>
      <label className="fld">Type
        <select value={form.type} onChange={set('type')}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="fld">Price per night (₦)<input inputMode="numeric" value={form.price} onChange={set('price')} placeholder="55000" /></label>
      <label className="fld">Sleeps
        <select value={form.maxGuests} onChange={set('maxGuests')}>{Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>{plural(i + 1, 'guest')}</option>)}</select>
      </label>
      <label className="fld wide">Description
        <textarea rows={6} value={form.about} onChange={set('about')}
          placeholder="What it’s like to stay, what’s nearby, and anything guests should know (power, parking, security)." />
        <small className="muted">{form.about.trim().length} / 2,000 characters (at least 40)</small>
      </label>
      <div className="form-foot wide">
        {error && <p className="err">{error}</p>}
        {saved && <p className="ok">Saved.</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : listing ? 'Save changes' : 'Create and add photos'}</button>
        {!listing && <p className="muted small">New places start paused. They go live when you add a photo and press Publish.</p>}
      </div>
    </form>
  );
}

/* ---------------- photos ---------------- */

function Photos({ listing, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function upload(files) {
    setError('');
    let photos = listing.photos;
    for (const [i, file] of [...files].entries()) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError(`${file.name} isn’t a JPEG, PNG or WebP image.`); continue; }
      if (file.size > 5 * 1024 * 1024) { setError(`${file.name} is over 5 MB.`); continue; }
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try { photos = (await uploadPhoto(listing.id, file)).photos; onChange(photos); }
      catch (err) { setError(err.message); break; }
    }
    setBusy('');
    if (input.current) input.current.value = '';
  }

  async function act(path, method) {
    setError('');
    try { onChange((await api(path, { method, body: method === 'POST' ? {} : undefined })).photos); }
    catch (err) { setError(err.message); }
  }

  return (
    <section className="card-block">
      <div className="block-head">
        <div>
          <h2>Photos</h2>
          <p className="muted small">The first photo is the cover guests see on the card. JPEG, PNG or WebP, up to 5 MB each, 12 at most.</p>
        </div>
        <button className="btn" disabled={!!busy || listing.photos.length >= 12} onClick={() => input.current?.click()}>{busy || 'Upload photos'}</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => upload(e.target.files)} />
      </div>
      {error && <p className="err">{error}</p>}
      {listing.photos.length ? (
        <div className="pgrid">
          {listing.photos.map((p, i) => (
            <figure key={p.id} className={i === 0 ? 'cover' : ''}>
              <img src={p.thumb} alt={p.alt} />
              <figcaption>
                {i === 0 ? <span className="chip active">Cover</span>
                  : <button className="linkish" onClick={() => act(`/api/host/listings/${listing.id}/photos/${p.id}/cover`, 'POST')}>Make cover</button>}
                <button className="linkish danger" onClick={() => act(`/api/host/listings/${listing.id}/photos/${p.id}`, 'DELETE')}>Remove</button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="drop" onClick={() => input.current?.click()}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }}>
          Drop photos here, or click to choose them.
        </div>
      )}
    </section>
  );
}

/* ---------------- calendar ---------------- */

const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function Calendar({ listing }) {
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [entries, setEntries] = useState([]);
  const [sel, setSel] = useState(null);           // { start, end } dates (inclusive nights)
  const [picked, setPicked] = useState(null);     // an existing entry
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [busy, setBusy] = useState(false);
  useTick();

  const from = toIso(addD(month, -7));
  const to = toIso(addD(new Date(month.getFullYear(), month.getMonth() + 2, 1), 7));

  async function load() {
    const r = await api(`/api/host/listings/${listing.id}/calendar?from=${from}&to=${to}`);
    setEntries(r.entries);
  }
  useEffect(() => { load().catch(err => setMsg({ text: err.message })); }, [listing.id, from, to]); // eslint-disable-line

  // night → entry
  const nights = useMemo(() => {
    const m = new Map();
    for (const e of entries) for (let d = fromIso(e.checkIn); d < fromIso(e.checkOut); d = addD(d, 1)) m.set(toIso(d), e);
    return m;
  }, [entries]);

  function clickDay(d) {
    setMsg({ text: '' });
    const e = nights.get(toIso(d));
    if (e) { setSel(null); setPicked(e); return; }
    setPicked(null);
    if (d < today) return;
    if (!sel || sel.end || d < sel.start) { setSel({ start: d, end: null }); return; }
    // second click: make sure no taken night sits inside the range
    for (let x = sel.start; x <= d; x = addD(x, 1)) {
      if (nights.has(toIso(x))) { setMsg({ text: 'That range runs into nights that are already taken. Pick dates around them.' }); setSel({ start: d, end: null }); return; }
    }
    setSel({ start: sel.start, end: d });
  }

  async function block() {
    const end = sel.end || sel.start;
    setBusy(true);
    try {
      await api(`/api/host/listings/${listing.id}/blocks`, { method: 'POST', body: { checkIn: toIso(sel.start), checkOut: toIso(addD(end, 1)) } });
      setSel(null);
      setMsg({ text: `Blocked ${plural(Math.round((addD(end, 1) - sel.start) / 864e5), 'night')}. Guests can’t book them now.`, ok: true });
      await load();
    } catch (err) { setMsg({ text: err.message }); await load(); }
    finally { setBusy(false); }
  }

  async function unblock(e) {
    setBusy(true);
    try {
      await api(`/api/host/blocks/${e.id}`, { method: 'DELETE' });
      setPicked(null);
      setMsg({ text: 'Unblocked. Those nights are open to guests again.', ok: true });
      await load();
    } catch (err) { setMsg({ text: err.message }); }
    finally { setBusy(false); }
  }

  const inSel = d => sel && d >= sel.start && d <= (sel.end || sel.start);
  const upcoming = entries.filter(e => fromIso(e.checkOut) > today);

  return (
    <section className="card-block cal-wrap">
      <div className="block-head">
        <div>
          <h2>Calendar</h2>
          <p className="muted small">Click a first and last night to block dates you’re not renting out. Click a blocked night to unblock it.</p>
        </div>
        <div className="cal-nav">
          <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            disabled={month <= new Date(today.getFullYear(), today.getMonth(), 1)}>Previous</button>
          <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>Next</button>
        </div>
      </div>

      <div className="months">
        {[0, 1].map(k => <Month key={k} first={new Date(month.getFullYear(), month.getMonth() + k, 1)}
          today={today} nights={nights} inSel={inSel} picked={picked} onClick={clickDay} />)}
      </div>

      <div className="legend">
        <span><i className="sw free" />Open</span><span><i className="sw held" />Held by a guest</span>
        <span><i className="sw block" />Blocked by you</span><span><i className="sw sel" />Selected</span>
      </div>

      <div className="cal-panel" aria-live="polite">
        {sel && (
          <div className="panel-row">
            <span>{sel.end
              ? <>Block <b>{shortDate(toIso(sel.start))} – {longDate(toIso(addD(sel.end, 1)))}</b> ({plural(Math.round((addD(sel.end, 1) - sel.start) / 864e5), 'night')})</>
              : <>First night <b>{longDate(toIso(sel.start))}</b>. Click the last night, or block just this one.</>}</span>
            <span className="panel-actions">
              <button className="btn" disabled={busy} onClick={block}>{sel.end ? 'Block these nights' : 'Block this night'}</button>
              <button className="linkish" onClick={() => setSel(null)}>Clear</button>
            </span>
          </div>
        )}
        {picked && (
          <div className="panel-row">
            {picked.kind === 'block' ? (
              <>
                <span>Blocked <b>{shortDate(picked.checkIn)} – {longDate(picked.checkOut)}</b></span>
                <span className="panel-actions"><button className="btn ghost" disabled={busy} onClick={() => unblock(picked)}>Unblock</button></span>
              </>
            ) : (
              <span>Held by <b>{picked.guest}</b> for {plural(picked.guests, 'guest')}, {shortDate(picked.checkIn)} – {longDate(picked.checkOut)}, {naira(picked.total)} · {timeLeft(picked.holdExpiresAt)}. Guest holds can’t be changed by hosts.</span>
            )}
          </div>
        )}
        {msg.text && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      </div>

      <h3 className="sub">Coming up</h3>
      {upcoming.length ? (
        <ul className="upcoming">
          {upcoming.map(e => (
            <li key={e.id}>
              <span className={`chip ${e.kind === 'block' ? 'block' : 'held'}`}>{e.kind === 'block' ? 'Blocked' : 'On hold'}</span>
              <span>{shortDate(e.checkIn)} – {longDate(e.checkOut)}</span>
              <span className="muted">{e.kind === 'block' ? 'Not available to guests' : `${e.guest}, ${plural(e.guests, 'guest')} · ${timeLeft(e.holdExpiresAt)}`}</span>
              {e.kind === 'block' && <button className="linkish" disabled={busy} onClick={() => unblock(e)}>Unblock</button>}
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Nothing booked or blocked in these two months.</p>}
    </section>
  );
}

function Month({ first, today, nights, inSel, picked, onClick }) {
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return (
    <div className="month">
      <h4>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h4>
      <div className="dow">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d}>{d}</span>)}</div>
      <div className="days">
        {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(first.getFullYear(), first.getMonth(), i + 1);
          const e = nights.get(toIso(d));
          const cls = [
            d < today ? 'past' : '',
            e ? (e.kind === 'block' ? 'block' : 'held') : '',
            inSel(d) ? 'sel' : '',
            picked && e && picked.id === e.id ? 'picked' : '',
            d.getTime() === today.getTime() ? 'today' : ''
          ].join(' ');
          return (
            <button key={i} className={cls} disabled={d < today && !e} onClick={() => onClick(d)}
              title={e ? (e.kind === 'block' ? 'Blocked by you' : `Held by ${e.guest}`) : undefined}>{i + 1}</button>
          );
        })}
      </div>
    </div>
  );
}
