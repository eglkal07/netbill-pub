import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { rupiah, tgl, periode, thisPeriod, download, toCSV } from '../lib/format.js';
import { Badge, Empty, Field, Loading, Modal, useAction, useLoad } from '../components/ui.jsx';
import PayModal from './PayModal.jsx';

export default function Invoices() {
  const [sp] = useSearchParams();
  const [f, setF] = useState({ status: sp.get('status') || 'unpaid', period: '', q: '', overdue: '' });
  const { data, loading, error, reload } = useLoad(() => api.get('/invoices' + qs(f)), [f.status, f.period, f.q, f.overdue]);
  const [pay, setPay] = useState(null);
  const [gen, setGen] = useState(null);
  const [run, busy] = useAction();

  useEffect(() => {
    const s = getSocket();
    s.on('payment:paid', reload);
    return () => s.off('payment:paid', reload);
  }, [reload]);

  const total = (data || []).reduce((a, b) => a + Number(b.amount), 0);
  const exportCsv = () => download(`tagihan-${f.period || 'semua'}.csv`, toCSV(data || [], [
    { label: 'No', value: 'invoice_no' }, { label: 'ID', value: 'code' }, { label: 'Nama', value: 'name' }, { label: 'Periode', value: 'period' },
    { label: 'Jatuh tempo', value: 'due_date' }, { label: 'Nominal', value: 'amount' }, { label: 'Status', value: 'status' }, { label: 'Dibayar', value: 'paid_at' }
  ]));

  return (
    <>
      <div className="page-head">
        <div><h1>Tagihan</h1><p>Tagihan dibuat otomatis sebelum jatuh tempo. Lewat jatuh tempo = PPPoE diisolir otomatis.</p></div>
        <div className="row">
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={() => setGen({ period: thisPeriod(), notify: true })}>Generate tagihan massal</button>
        </div>
      </div>
      <div className="toolbar">
        <input placeholder="Cari nama / ID / no. tagihan" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Semua status</option><option value="unpaid">Belum bayar</option><option value="paid">Lunas</option><option value="cancelled">Batal</option>
        </select>
        <input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={f.overdue === '1'} onChange={(e) => setF({ ...f, overdue: e.target.checked ? '1' : '' })} />Lewat jatuh tempo</label>
        <span className="muted small">{data?.length || 0} tagihan · {rupiah(total)}</span>
      </div>
      <Loading loading={loading && !data} error={error}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>No. tagihan</th><th>Pelanggan</th><th>Periode</th><th>Jatuh tempo</th><th className="num">Nominal</th><th>Status</th><th>Pengingat</th><th /></tr></thead>
            <tbody>{data?.map((i) => {
              const late = i.status === 'unpaid' && new Date(i.due_date) < new Date(new Date().toDateString());
              return (
                <tr key={i.id}>
                  <td className="mono">{i.invoice_no}</td>
                  <td><Link to={`/customers/${i.customer_id}`}>{i.name}</Link><div className="small muted">{i.code} · <Badge s={i.customer_status} /></div></td>
                  <td>{periode(i.period)}</td>
                  <td style={{ color: late ? 'var(--bad)' : undefined }}>{tgl(i.due_date)}{late && <div className="small">lewat tempo</div>}</td>
                  <td className="num">{rupiah(i.amount)}</td>
                  <td><Badge s={i.status} />{i.paid_at && <div className="small muted">{tgl(i.paid_at, true)}</div>}</td>
                  <td className="small">{i.reminder_sent_at ? tgl(i.reminder_sent_at, true) : '-'}</td>
                  <td className="right">{i.status === 'unpaid' && (
                    <div className="btn-group">
                      <button className="btn sm ok" onClick={() => setPay(i)}>Bayar</button>
                      <button className="btn sm ghost" disabled={busy} onClick={() => run(() => api.post(`/invoices/${i.id}/remind`), 'Pengingat WA terkirim').then(reload)}>Ingatkan</button>
                      <button className="btn sm ghost" onClick={() => confirm('Batalkan tagihan?') && run(() => api.post(`/invoices/${i.id}/cancel`), 'Dibatalkan').then(reload)}>Batal</button>
                    </div>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {!data?.length && <Empty />}
        </div>
      </Loading>
      {pay && <PayModal invoice={pay} onClose={() => setPay(null)} onPaid={reload} />}
      {gen && (
        <Modal title="Generate tagihan massal" onClose={() => setGen(null)}
          footer={<button className="btn" disabled={busy} onClick={() => run(() => api.post('/invoices/generate', gen), (r) => `${r.created} tagihan dibuat`).then((r) => { if (r) { setGen(null); reload(); } })}>Generate</button>}>
          <div className="alert info">Membuat tagihan untuk semua pelanggan aktif/terisolir pada periode ini (yang belum punya tagihan).</div>
          <Field label="Periode"><input type="month" value={gen.period} onChange={(e) => setGen({ ...gen, period: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={gen.notify} onChange={(e) => setGen({ ...gen, notify: e.target.checked })} />Kirim notifikasi tagihan via WhatsApp</label>
        </Modal>
      )}
    </>
  );
}
