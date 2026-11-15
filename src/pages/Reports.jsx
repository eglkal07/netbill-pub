import { useState } from 'react';
import { api, qs } from '../lib/api.js';
import { rupiah, tgl, BULAN, BLN, download, toCSV } from '../lib/format.js';
import { Badge, BarChart, Empty, Loading, Tabs, useLoad } from '../components/ui.jsx';

function Monthly() {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const { data: d, loading, error } = useLoad(() => api.get('/reports/monthly' + qs(ym)), [ym.year, ym.month]);
  return (
    <>
      <div className="toolbar no-print">
        <select value={ym.month} onChange={(e) => setYm({ ...ym, month: Number(e.target.value) })}>{BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}</select>
        <input type="number" value={ym.year} onChange={(e) => setYm({ ...ym, year: Number(e.target.value) })} style={{ minWidth: 90, width: 100 }} />
        <button className="btn ghost" onClick={() => window.print()}>Cetak</button>
        {d && <button className="btn ghost" onClick={() => download(`laporan-${d.period}.csv`, toCSV(d.payments, [
          { label: 'Tanggal', value: 'paid_at' }, { label: 'No tagihan', value: 'invoice_no' }, { label: 'Periode tagihan', value: 'period' }, { label: 'ID', value: 'code' },
          { label: 'Nama', value: 'name' }, { label: 'Metode', value: 'method' }, { label: 'Channel', value: 'channel' }, { label: 'Nominal', value: 'amount' }, { label: 'Petugas', value: 'admin_name' }
        ]))}>Export CSV</button>}
      </div>
      <Loading loading={loading} error={error}>
        {d && (
          <>
            <h2 style={{ marginBottom: 12 }}>Laporan Keuangan {BULAN[ym.month - 1]} {ym.year}</h2>
            <div className="grid g4">
              <div className="stat ok"><div className="label">Total pemasukan</div><div className="value">{rupiah(d.total)}</div><div className="sub">{d.count} transaksi</div></div>
              <div className="stat accent"><div className="label">Total tagihan periode ini</div><div className="value">{rupiah(d.billing.total_amount)}</div><div className="sub">{d.billing.total_invoice} tagihan</div></div>
              <div className="stat ok"><div className="label">Tagihan lunas</div><div className="value">{rupiah(d.billing.paid_amount)}</div><div className="sub">{d.billing.paid_count || 0} tagihan</div></div>
              <div className="stat bad"><div className="label">Belum dibayar</div><div className="value">{rupiah(d.billing.unpaid_amount)}</div><div className="sub">{d.billing.unpaid_count || 0} tagihan</div></div>
            </div>
            <div className="grid g2 mt">
              <div className="card"><h3>Pemasukan harian</h3><div className="mt" /><BarChart format={rupiah} height={180} data={d.daily.map((x) => ({ label: `Tgl ${x.day}`, short: x.day % 5 === 0 || x.day === 1 ? x.day : '', value: x.total }))} /></div>
              <div className="card"><h3>Per metode pembayaran</h3>
                {d.byMethod.length ? <table className="mt"><tbody>{d.byMethod.map((m, i) => (
                  <tr key={i}><td>{m.method === 'manual' ? 'Manual' : 'Midtrans'} · {m.channel}</td><td className="num">{m.n}x</td><td className="num"><b>{rupiah(m.total)}</b></td></tr>
                ))}</tbody></table> : <Empty />}
              </div>
            </div>
            <div className="card mt">
              <h3>Rincian transaksi</h3>
              <div className="table-wrap mt"><table>
                <thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Tagihan</th><th>Metode</th><th className="num">Nominal</th><th>Petugas</th></tr></thead>
                <tbody>{d.payments.map((p) => (
                  <tr key={p.id}><td>{tgl(p.paid_at, true)}</td><td>{p.code} · {p.name}</td><td className="mono">{p.invoice_no}</td><td>{p.method}{p.channel ? ` · ${p.channel}` : ''}</td><td className="num">{rupiah(p.amount)}</td><td>{p.admin_name || '-'}</td></tr>
                ))}</tbody>
                <tfoot><tr><th colSpan="4">TOTAL</th><th className="num">{rupiah(d.total)}</th><th /></tr></tfoot>
              </table></div>
            </div>
            {d.unpaidList.length > 0 && (
              <div className="card mt">
                <h3>Tagihan belum dibayar periode ini ({d.unpaidList.length})</h3>
                <div className="table-wrap mt"><table>
                  <thead><tr><th>Pelanggan</th><th>No. tagihan</th><th>Jatuh tempo</th><th>Status layanan</th><th className="num">Nominal</th></tr></thead>
                  <tbody>{d.unpaidList.map((u) => <tr key={u.invoice_no}><td>{u.code} · {u.name}</td><td className="mono">{u.invoice_no}</td><td>{tgl(u.due_date)}</td><td><Badge s={u.status} /></td><td className="num">{rupiah(u.amount)}</td></tr>)}</tbody>
                </table></div>
              </div>
            )}
          </>
        )}
      </Loading>
    </>
  );
}

function Yearly() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: d, loading, error } = useLoad(() => api.get('/reports/yearly?year=' + year), [year]);
  return (
    <>
      <div className="toolbar no-print">
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110, minWidth: 90 }} />
        <button className="btn ghost" onClick={() => window.print()}>Cetak</button>
        {d && <button className="btn ghost" onClick={() => download(`laporan-${year}.csv`, toCSV(d.months, [
          { label: 'Bulan', value: (m) => BULAN[m.month - 1] }, { label: 'Pemasukan', value: 'income' }, { label: 'Manual', value: 'manual' }, { label: 'Online', value: 'online' },
          { label: 'Transaksi', value: 'count' }, { label: 'Total tagihan', value: 'billed' }, { label: 'Tagihan lunas', value: 'billed_paid' }, { label: 'Tunggakan', value: 'billed_unpaid' }, { label: 'Pelanggan baru', value: 'new_customers' }
        ]))}>Export CSV</button>}
      </div>
      <Loading loading={loading} error={error}>
        {d && (
          <>
            <h2 style={{ marginBottom: 12 }}>Laporan Tahunan {year}</h2>
            <div className="grid g3">
              <div className="stat ok"><div className="label">Total pemasukan {year}</div><div className="value">{rupiah(d.total)}</div></div>
              <div className="stat accent"><div className="label">Rata-rata per bulan</div><div className="value">{rupiah(Math.round(d.total / Math.max(1, d.months.filter((m) => m.income > 0).length)))}</div></div>
              <div className="stat bad"><div className="label">Total tunggakan</div><div className="value">{rupiah(d.months.reduce((a, b) => a + b.billed_unpaid, 0))}</div></div>
            </div>
            <div className="card mt"><h3>Pemasukan per bulan</h3><div className="mt" /><BarChart format={rupiah} data={d.months.map((m) => ({ label: BULAN[m.month - 1], short: BLN[m.month - 1], value: m.income }))} /></div>
            <div className="table-wrap mt"><table>
              <thead><tr><th>Bulan</th><th className="num">Pemasukan</th><th className="num">Manual</th><th className="num">Online</th><th className="num">Transaksi</th><th className="num">Total tagihan</th><th className="num">Tunggakan</th><th className="num">Pelanggan baru</th></tr></thead>
              <tbody>{d.months.map((m) => (
                <tr key={m.month}><td>{BULAN[m.month - 1]}</td><td className="num"><b>{rupiah(m.income)}</b></td><td className="num">{rupiah(m.manual)}</td><td className="num">{rupiah(m.online)}</td>
                  <td className="num">{m.count}</td><td className="num">{rupiah(m.billed)}</td><td className="num">{rupiah(m.billed_unpaid)}</td><td className="num">{m.new_customers}</td></tr>
              ))}</tbody>
              <tfoot><tr><th>TOTAL</th><th className="num">{rupiah(d.total)}</th><th className="num">{rupiah(d.months.reduce((a, b) => a + b.manual, 0))}</th><th className="num">{rupiah(d.months.reduce((a, b) => a + b.online, 0))}</th>
                <th className="num">{d.months.reduce((a, b) => a + b.count, 0)}</th><th className="num">{rupiah(d.months.reduce((a, b) => a + b.billed, 0))}</th><th className="num">{rupiah(d.months.reduce((a, b) => a + b.billed_unpaid, 0))}</th><th className="num">{d.months.reduce((a, b) => a + b.new_customers, 0)}</th></tr></tfoot>
            </table></div>
          </>
        )}
      </Loading>
    </>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('monthly');
  return (
    <>
      <div className="page-head no-print"><div><h1>Laporan Keuangan</h1><p>Laporan bulanan & tahunan</p></div></div>
      <div className="no-print"><Tabs value={tab} onChange={setTab} tabs={[['monthly', 'Bulanan'], ['yearly', 'Tahunan']]} /></div>
      {tab === 'monthly' ? <Monthly /> : <Yearly />}
    </>
  );
}
