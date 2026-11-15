import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Field, useAction } from '../components/ui.jsx';

export default function Profile() {
  const { user } = useAuth();
  const [pw, setPw] = useState({ old_password: '', new_password: '', confirm: '' });
  const [run, busy] = useAction();
  const save = () => {
    if (pw.new_password !== pw.confirm) return alert('Konfirmasi password tidak sama');
    run(() => api.post('/auth/change-password', pw), 'Password berhasil diganti').then((r) => r && setPw({ old_password: '', new_password: '', confirm: '' }));
  };
  return (
    <>
      <div className="page-head"><div><h1>Profil Saya</h1><p>{user.name} · {user.username} · {user.role_label || user.role}</p></div></div>
      <div className="grid g2">
        <div className="card">
          <h3>Ganti password</h3><div className="mt" />
          <Field label="Password lama"><input type="password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} /></Field>
          <Field label="Password baru" hint="Minimal 6 karakter"><input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Field label="Ulangi password baru"><input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <button className="btn" disabled={busy || pw.new_password.length < 6} onClick={save}>Simpan</button>
        </div>
        <div className="card">
          <h3>Hak akses Anda</h3>
          <div className="row mt" style={{ gap: 6 }}>{user.permissions?.map((p) => <span key={p} className="badge b-info">{p}</span>)}</div>
        </div>
      </div>
    </>
  );
}
