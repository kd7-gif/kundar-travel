import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const DEMO = { email: 'adaeze@host.kundar.test', password: 'kundar-host-demo' };

export default function Login() {
  const { user, setUser } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const body = mode === 'signup'
        ? { name: form.name, email: form.email, password: form.password, asHost: true }
        : { email: form.email, password: form.password };
      const r = await api(`/api/auth/${mode}`, { method: 'POST', body });
      setUser(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function becomeHost() {
    setBusy(true);
    try { setUser((await api('/api/auth/become-host', { method: 'POST', body: {} })).user); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    setUser(null);
  }

  // Logged in, but as a guest
  if (user) {
    return (
      <div className="auth">
        <div className="auth-card">
          <p className="eyebrow">Kundar Travel</p>
          <h1>Host your place</h1>
          <p className="muted">You’re signed in as <b>{user.name}</b> with a guest account. Turn it into a host account to list a place and manage its calendar.</p>
          {error && <p className="err">{error}</p>}
          <button className="btn" disabled={busy} onClick={becomeHost}>Become a host</button>
          <button className="btn ghost" onClick={logout}>Use a different account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <p className="eyebrow">Kundar Travel</p>
        <h1>{mode === 'login' ? 'Host dashboard' : 'Become a host'}</h1>
        <p className="muted">{mode === 'login' ? 'Manage your places, calendars and guest holds.' : 'List your place in Lagos, Abuja, Ibadan or Port Harcourt.'}</p>

        <div className="seg">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create host account</button>
        </div>

        <form onSubmit={submit} noValidate>
          {mode === 'signup' && (
            <label className="fld">Full name<input value={form.name} onChange={set('name')} autoComplete="name" /></label>
          )}
          <label className="fld">Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="fld">Password<input type="password" value={form.password} onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {error && <p className="err">{error}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>

        {mode === 'login' && (
          <div className="demo">
            <p>Just looking? Use the demo host, Adaeze Okafor, who runs the eight sample stays.</p>
            <button className="linkish" onClick={() => setForm(f => ({ ...f, ...DEMO }))}>Fill in the demo login</button>
          </div>
        )}
      </div>
    </div>
  );
}
