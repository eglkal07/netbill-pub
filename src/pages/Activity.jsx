import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { tgl, download, toCSV } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import { Empty, Loading, useLoad } from '../components/ui.jsx';

export default function Activity() {
  const { can } = useAuth();
  const all = can('logs.all');
  const [f, setF] = useState({ user_id: '', action: '', from: '', to: '', q: '' });
  const { data, loading, error, reload } = useLoad(() => api.get('/reports/activity' + qs(f)), [f.user_id, f.action, f.from, f.to, f.q]);
  const { data: users } = useLoad(() => (can('users.manage') ? api.get('/auth/users') : Promise.resolve([])));
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    if (!all) return undefined;
    const s = getSocket();
    const h = (j) => { setJobs((x) => [j, ...x].slice(0, 30)); reload(); };
    s.on('job:log', h);
    return () => s.off('job:log', h);
  }, [reload, all]);

  const rows = data?.rows || [];
  return (
    <>
      <div className="page-head">
        <div><h1>Log Aktivitas</h1><p>{all ? 'Aktivitas semua user & proses otomatis sistem' : 'Aktivitas akun Anda'}</p></div>
        <button className="btn ghost" onClick={() => download('log-aktivitas.csv', toCSV(rows, [
          { label: 'Waktu', value: 'created_at' }, { label: 'User', value: (r) => r.user_name || r.actor }, { label: 'Role', value: 'user_role' },
          { label: 'Aksi', value: 'action' }, { label: 'Detail', value: 'detail' }
        ]))}>Export CSV</button>
      </div>
      <div className="toolbar">
        {all && (
          <select value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}>
            <option value="">Semua user</option>
            <option value="system">Sistem otomatis</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role_label || u.role})</option>)}
          </select>
        )}
        <select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
          <option value="">Semua aksi</option>{data?.actions?.map((a) => <option key={a}>{a}</option>)}
        </select>
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <span className="muted">s/d</span>
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <input placeholder="Cari detail" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </div>
      {all && jobs.length > 0 && <div className="pre" style={{ marginBottom: 16 }}>{jobs.map((j) => `[${j.at}] ${j.name}: ${JSON.stringify(j.result)}`).join('\n')}</div>}
      <Loading loading={loading && !data} error={error}>
        <div className="table-wrap"><table>
          <thead><tr><th>Waktu</th><th>Oleh</th><th>Aksi</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((l) => (
            <tr key={l.id}>
              <td>{tgl(l.created_at, true)}</td>
              <td>{l.user_name || l.actor}{l.user_role && <div className="small muted">{l.user_role}</div>}</td>
              <td><span className="badge b-info">{l.action}</span></td>
              <td style={{ whiteSpace: 'normal' }}>{l.detail}</td>
            </tr>
          ))}</tbody>
        </table>{!rows.length && <Empty />}</div>
      </Loading>
    </>
  );
}
