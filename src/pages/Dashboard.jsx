import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import TrafficMonitor from '../components/TrafficMonitor.jsx';
import { rupiah, tgl, BLN, DEVICE_TYPE } from '../lib/format.js';
import { Badge, BarChart, Loading, useLoad, Empty } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Dashboard() {
  const { can } = useAuth();
  const { data: d, loading, error, reload } = useLoad(() => api.get('/reports/dashboard'));

  useEffect(() => {
    const s = getSocket();
    const h = () => reload();
    s.on('payment:paid', h); s.on('customer:updated', h); s.on('devices:status', h);
    return () => { s.off('payment:paid', h); s.off('customer:updated', h); s.off('devices:status', h); };
  }, [reload]);

  return (
    <Loading loading={loading && !d} error={error}>
      {d && (
        <>
          <div className="page-head"><div><h1>Dashboard</h1><p>Ringkasan jaringan & keuangan hari ini</p></div></div>
          {d.counts.pending > 0 && can('customers.manage') && (
            <div className="alert info row" style={{ justifyContent: 'space-between' }}>
              <span>📋 Ada <b>{d.counts.pending}</b> pendaftaran pelanggan dari teknisi yang menunggu dilengkapi & diaktivasi.</span>
              <Link className="btn sm" to="/registrations">Proses sekarang</Link>
            </div>
          )}
          {can('dashboard.traffic') && <div style={{ marginBottom: 16 }}><TrafficMonitor /></div>}
          <div className="grid g4">
            <div className="stat accent"><div className="label">Pelanggan aktif</div><div className="value">{d.counts.active || 0}</div><div className="sub">dari {(d.counts.active || 0) + (d.counts.isolated || 0) + (d.counts.inactive || 0)} pelanggan</div></div>
            <div className="stat bad"><div className="label">Terisolir</div><div className="value">{d.counts.isolated || 0}</div><div className="sub"><Link to="/customers?status=isolated">lihat daftar</Link></div></div>
            <div className="stat ok"><div className="label">Pemasukan bulan ini</div><div className="value">{rupiah(d.income.total)}</div><div className="sub">{d.income.n} transaksi · hari ini {rupiah(d.today.total)}</div></div>
            <div className="stat warn"><div className="label">Belum dibayar</div><div className="value">{rupiah(d.unpaid.total)}</div><div className="sub">{d.unpaid.n} tagihan · {d.overdue.n} lewat jatuh tempo</div></div>
          </div>

          <div className="grid g2 mt">
            <div className="card">
              <div className="card-head"><h2>Pemasukan 12 bulan terakhir</h2></div>
              {d.chart.length ? (
                <BarChart format={rupiah} data={d.chart.map((c) => ({ label: c.ym, short: BLN[Number(c.ym.slice(5)) - 1], value: Number(c.total) }))} />
              ) : <Empty text="Belum ada pembayaran" />}
            </div>
            <div className="card">
              <div className="card-head"><h2>Status perangkat</h2></div>
              {d.devices.length ? (
                <table><tbody>
                  {d.devices.map((x) => (
                    <tr key={x.id}><td><b>{x.name}</b><div className="small muted">{DEVICE_TYPE[x.type]?.[0]}{x.vendor && x.type !== 'mikrotik' ? ` ${x.vendor}` : ''} · dikelola admin</div></td>
                      <td className="right"><Badge s={x.last_status} /><div className="small muted">{tgl(x.last_checked_at, true)}</div></td></tr>
                  ))}
                </tbody></table>
              ) : <Empty text="Belum ada perangkat" />}
            </div>
          </div>

          <div className="grid g2 mt">
            <div className="card">
              <div className="card-head"><h2>Jatuh tempo 5 hari ke depan</h2><Link to="/invoices?status=unpaid" className="small">Semua tagihan</Link></div>
              {d.dueSoon.length ? (
                <table><tbody>{d.dueSoon.map((i) => (
                  <tr key={i.id}><td>{i.name}<div className="small muted">{i.code} · {i.invoice_no}</div></td><td>{tgl(i.due_date)}</td><td className="num">{rupiah(i.amount)}</td></tr>
                ))}</tbody></table>
              ) : <Empty text="Tidak ada" />}
            </div>
            <div className="card">
              <div className="card-head"><h2>Pembayaran terbaru</h2><Link to="/payments" className="small">Semua</Link></div>
              {d.recent.length ? (
                <table><tbody>{d.recent.map((p) => (
                  <tr key={p.id}><td>{p.name}<div className="small muted">{p.invoice_no}</div></td>
                    <td><span className={`badge ${p.method === 'manual' ? 'b-info' : 'b-ok'}`}>{p.method === 'manual' ? 'Manual' : p.channel || 'Online'}</span></td>
                    <td className="num">{rupiah(p.amount)}<div className="small muted">{tgl(p.paid_at, true)}</div></td></tr>
                ))}</tbody></table>
              ) : <Empty text="Belum ada" />}
            </div>
          </div>
        </>
      )}
    </Loading>
  );
}
