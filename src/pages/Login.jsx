import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { resetDemo } from '../mock/db.js';

const DEMO = [['operator', 'Operator'], ['teknisi', 'Teknisi']];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(f.username, f.password); nav('/'); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>NetBill</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 22 }}>Masuk ke panel admin</p>
        {err && <div className="alert bad">{err}</div>}
        <div className="field"><label>Username</label><input autoFocus value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
        <div className="field"><label>Password</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy}>{busy ? 'Memproses...' : 'Masuk'}</button>
        <div className="demo-box">
          <b>Versi demo</b>: semua data fiktif. MikroTik, OLT ZTE & WhatsApp dianggap sudah terhubung (diatur admin); Midtrans disimulasikan. Password semua akun: <code>demo123</code>
          <div className="demo-accounts">
            {DEMO.map(([u, r]) => <button type="button" key={u} onClick={() => setF({ username: u, password: 'demo123' })}><b>{u}</b><small>{r}</small></button>)}
          </div>
          <button type="button" className="link-btn" onClick={() => { if (confirm('Kembalikan semua data demo ke kondisi awal?')) { resetDemo(); location.reload(); } }}>Reset data demo</button>
        </div>
      </form>
    </div>
  );
}
