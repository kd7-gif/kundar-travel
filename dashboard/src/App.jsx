import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, SITE_URL } from './api.js';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Listings from './pages/Listings.jsx';
import ListingEditor from './pages/ListingEditor.jsx';
import Holds from './pages/Holds.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    api('/api/auth/me')
      .then(r => setUser(r.user))
      .catch(() => { setApiDown(true); setUser(null); });
  }, []);

  if (user === undefined) return <div className="boot">Loading…</div>;

  const isHost = user && (user.role === 'host' || user.role === 'admin');
  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      {apiDown && <div className="banner">Can’t reach the Kundar API. Start it with <code>npm run dev</code> in <code>api/</code>.</div>}
      {isHost ? <Shell /> : <Login />}
    </AuthCtx.Provider>
  );
}

function Shell() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    setUser(null);
    navigate('/');
  }

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="side-top">
          <a className="brand" href={SITE_URL}>Kundar Travel</a>
          <span className="brand-sub">Host dashboard</span>
          <button className="menu-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Close' : 'Menu'}</button>
        </div>
        <nav className="side-nav" onClick={() => setOpen(false)}>
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/listings">Listings</NavLink>
          <NavLink to="/holds">Guest holds</NavLink>
        </nav>
        <div className="side-foot">
          <div className="who"><b>{user.name}</b><span>{user.email}</span></div>
          <a href={SITE_URL} target="_blank" rel="noreferrer">View the site</a>
          <button className="linkish" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/listings/new" element={<ListingEditor />} />
          <Route path="/listings/:id" element={<ListingEditor />} />
          <Route path="/holds" element={<Holds />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
