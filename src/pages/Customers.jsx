import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { rupiah, download, toCSV } from '../lib/format.js';
import { Badge, DeviceSelect, Empty, Field, Loading, Modal, useAction, useLoad } from '../components/ui.jsx';
import CustomerForm from './CustomerForm.jsx';

export default function Customers() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const status = sp.get('status') || '';
  const { data, loading, error, reload } = useLoad(() => api.get('/customers' + qs({ q, status })), [q, status]);
  const { data: devices } = useLoad(() => api.get('/devices?type=mikrotik'));
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(null);
  const [run, busy] = useAction();

  useEffect(() => {
    const s = getSocket();
    s.on('customer:updated', reload);
    return () => s.off('customer:updated', reload);
  }, [reload]);

  const act = (c, path, msg, body = {}) => run(() => api.post(`/customers/${c.id}/${path}`, body), msg).then(reload);

  const exportCsv = () => download('pelanggan.csv', toCSV(data || [], [
    { label: 'ID', value: 'code' }, { label: 'Nama', value: 'name' }, { label: 'HP', value: 'phone' }, { label: 'Alamat', value: 'address' },
    { label: 'Paket', value: 'package_name' }, { label: 'Harga', value: 'package_price' }, { label: 'PPPoE', value: 'pppoe_username' },
    { label: 'Status', value: 'status' }, { label: 'Jatuh tempo', value: 'billing_day' }, { label: 'Tunggakan', value: 'unpaid_total' }
  ]));

  return (
    <>
      <div className="page-head">
        <div><h1>Pelanggan PPPoE</h1><p>Tambah, isolir, aktifkan, hapus & konfigurasi PPPoE pelanggan</p></div>
        <div className="row">
          <button className="btn ghost" onClick={() => setImp({ router_id: '', billing_day: 10 })}>Import dari router</button>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={() => setForm({})}>+ Tambah Pelanggan</button>
        </div>
      </div>
      <div className="toolbar">
        <input placeholder="Cari nama / ID / PPPoE / HP" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setSp(e.target.value ? { status: e.target.value } : {})}>
          <option value="">Semua (kecuali dihapus)</option>
          <option value="active">Aktif</option><option value="isolated">Terisolir</option>
          <option value="inactive">Nonaktif</option><option value="deleted">Dihapus</option>
        </select>
        <span className="muted small">{data?.length || 0} pelanggan</span>
      </div>
      <Loading loading={loading && !data} error={error}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pelanggan</th><th>PPPoE</th><th>Paket</th><th>Router</th><th>Tempo</th><th className="num">Tunggakan</th><th>Status</th><th /></tr></thead>
            <tbody>{data?.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/customers/${c.id}`}><b>{c.name}</b></Link><div className="small muted">{c.code} · {c.phone || '-'}</div></td>
                <td className="mono">{c.pppoe_username}{c.onu_sn && <div className="small muted">ONU {c.onu_pon}:{c.onu_id}</div>}</td>
                <td>{c.package_name}<div className="small muted">{rupiah(c.package_price)}</div></td>
                <td className="small">{c.router_name}</td>
                <td>Tgl {c.billing_day}</td>
                <td className="num">{c.unpaid_count > 0 ? <span style={{ color: 'var(--bad)' }}>{rupiah(c.unpaid_total)}<div className="small">{c.unpaid_count} tagihan</div></span> : '-'}</td>
                <td><Badge s={c.status} /></td>
                <td className="right">
                  <div className="btn-group">
                    {c.status === 'active' && <button className="btn sm warn" disabled={busy} onClick={() => confirm(`Isolir ${c.name}?`) && act(c, 'isolate', 'PPPoE diisolir', { notify: true })}>Isolir</button>}
                    {c.status === 'isolated' && <button className="btn sm ok" disabled={busy} onClick={() => act(c, 'activate', 'PPPoE diaktifkan')}>Aktifkan</button>}
                    {['deleted', 'inactive'].includes(c.status) && <button className="btn sm ok" disabled={busy} onClick={() => act(c, 'reprovision', 'PPPoE dibuat ulang')}>Buat ulang</button>}
                    <button className="btn sm ghost" onClick={() => api.get('/customers/' + c.id).then(setForm)}>Edit</button>
                    <button className="btn sm ghost" title="Kirim detail akun via WhatsApp" disabled={busy}
                      onClick={() => confirm('Kirim detail akun via WA? Password aplikasi akan direset.') && act(c, 'send-account', (r) => (r.ok ? 'Detail akun terkirim' : 'Gagal: ' + r.error))}>WA</button>
                    {c.status !== 'deleted' && <button className="btn sm danger" disabled={busy}
                      onClick={() => confirm(`Hapus PPPoE ${c.pppoe_username} dari router${c.onu_sn ? ' & ONU dari OLT' : ''}?`) && act(c, 'delete-pppoe', 'PPPoE dihapus', { remove_onu: true })}>Hapus</button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.length && <Empty />}
        </div>
      </Loading>

      {form && <CustomerForm initial={form} onClose={() => setForm(null)} onSaved={reload} />}

      {imp && (
        <Modal title="Import secret PPPoE dari router" onClose={() => setImp(null)}
          footer={<><button className="btn ghost" onClick={() => setImp(null)}>Batal</button>
            <button className="btn" disabled={busy || !imp.router_id} onClick={async () => {
              const r = await run(() => api.post('/customers/import', imp), (x) => `${x.imported} pelanggan diimport`);
              if (r) { setImp({ ...imp, result: r }); reload(); }
            }}>Import</button></>}>
          <div className="alert info">Secret PPPoE yang belum ada di database akan dibuat menjadi pelanggan. Paket dicocokkan dari nama profile – buat paket terlebih dahulu.</div>
          <Field label="Router"><DeviceSelect devices={devices} value={imp.router_id} onChange={(v) => setImp({ ...imp, router_id: v })} /></Field>
          <Field label="Tanggal jatuh tempo default"><input type="number" value={imp.billing_day} onChange={(e) => setImp({ ...imp, billing_day: e.target.value })} /></Field>
          {imp.result?.skipped?.length > 0 && <div className="pre">{imp.result.skipped.join('\n')}</div>}
        </Modal>
      )}
    </>
  );
}
