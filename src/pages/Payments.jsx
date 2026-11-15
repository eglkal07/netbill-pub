import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { rupiah, tgl, periode, download, toCSV } from '../lib/format.js';
import { Badge, Empty, Loading, useLoad } from '../components/ui.jsx';

export default function Payments() {
  const [f, setF] = useState({ status: 'success', method: '', from: '', to: '', q: '' });
  const { data, loading, error, reload } = useLoad(() => api.get('/payments' + qs(f)), [f.status, f.method, f.from, f.to, f.q]);

  useEffect(() => {
    const s = getSocket();
    s.on('payment:paid', reload);
    return () => s.off('payment:paid', reload);
  }, [reload]);

  const total = (data || []).filter((p) => p.status === 'success').reduce((a, b) => a + Number(b.amount), 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Pembayaran</h1><p>Riwayat pembayaran manual (admin) & online (Midtrans) – update real-time</p></div>
        <button className="btn ghost" onClick={() => download('pembayaran.csv', toCSV(data || [], [
          { label: 'Tanggal', value: (r) => r.paid_at || r.created_at }, { label: 'No tagihan', value: 'invoice_no' }, { label: 'ID', value: 'code' }, { label: 'Nama', value: 'name' },
          { label: 'Periode', value: 'period' }, { label: 'Metode', value: 'method' }, { label: 'Channel', value: 'channel' }, { label: 'Status', value: 'status' },
          { label: 'Nominal', value: 'amount' }, { label: 'Petugas', value: 'admin_name' }
        ]))}>Export CSV</button>
      </div>
      <div className="toolbar">
        <input placeholder="Cari" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Semua status</option><option value="success">Berhasil</option><option value="pending">Menunggu</option><option value="expired">Kedaluwarsa</option><option value="failed">Gagal</option>
        </select>
        <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="">Semua metode</option><option value="manual">Manual (admin)</option><option value="midtrans">Online (Midtrans)</option>
        </select>
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <span className="muted">s/d</span>
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <span className="small"><b>Total berhasil: {rupiah(total)}</b></span>
      </div>
      <Loading loading={loading && !data} error={error}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Tagihan</th><th>Metode</th><th>Status</th><th className="num">Nominal</th><th>Admin / Order ID</th></tr></thead>
            <tbody>{data?.map((p) => (
              <tr key={p.id}>
                <td>{tgl(p.paid_at || p.created_at, true)}</td>
                <td>{p.name}<div className="small muted">{p.code}</div></td>
                <td className="mono">{p.invoice_no}<div className="small muted">{periode(p.period)}</div></td>
                <td><span className={`badge ${p.method === 'manual' ? 'b-info' : 'b-ok'}`}>{p.method === 'manual' ? 'Manual' : 'Midtrans'}</span> <span className="small">{p.channel}</span></td>
                <td><Badge s={p.status} /></td>
                <td className="num">{rupiah(p.amount)}</td>
                <td className="small">{p.admin_name || <span className="mono">{p.order_id}</span>}{p.note && <div className="muted">{p.note}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.length && <Empty />}
        </div>
      </Loading>
    </>
  );
}
