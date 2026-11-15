import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupiah, tgl, periode } from '../lib/format.js';
import { Badge, Empty, Field, Loading, Modal, useAction, useLoad } from '../components/ui.jsx';
import CustomerForm from './CustomerForm.jsx';
import PayModal from './PayModal.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: c, loading, error, reload } = useLoad(() => api.get('/customers/' + id), [id]);
  const [live, setLive] = useState(null);
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(null);
  const [msg, setMsg] = useState(null);
  const [run, busy] = useAction();

  const act = (path, okMsg, body = {}) => run(() => api.post(`/customers/${id}/${path}`, body), okMsg).then(reload);

  return (
    <Loading loading={loading && !c} error={error}>
      {c && (
        <>
          <div className="page-head">
            <div><h1>{c.name} <Badge s={c.status} /></h1><p>{c.code} · PPPoE <span className="mono">{c.pppoe_username}</span></p></div>
            <div className="row">
              <button className="btn ghost" onClick={() => run(() => api.get(`/customers/${id}/live`)).then((r) => r && setLive(r))}>Cek sesi</button>
              {c.status === 'active' && <button className="btn warn" disabled={busy} onClick={() => act('isolate', 'Diisolir', { notify: true })}>Isolir</button>}
              {c.status === 'isolated' && <button className="btn ok" disabled={busy} onClick={() => act('activate', 'Diaktifkan')}>Aktifkan</button>}
              {c.status === 'deleted' && <button className="btn ok" disabled={busy} onClick={() => act('reprovision', 'PPPoE dibuat ulang')}>Buat ulang PPPoE</button>}
              <button className="btn ghost" disabled={busy} onClick={() => act('kick', 'Sesi diputus')}>Putus sesi</button>
              <button className="btn ghost" onClick={() => setMsg('')}>Kirim WA</button>
              <button className="btn ghost" disabled={busy} onClick={() => confirm('Reset password aplikasi & kirim detail akun via WA?') && act('send-account', (r) => (r.ok ? 'Detail akun terkirim' : 'WA gagal: ' + r.error + (r.app_password ? ` (password baru: ${r.app_password})` : '')))}>Kirim akun</button>
              <button className="btn" onClick={() => setEdit(true)}>Edit</button>
            </div>
          </div>

          <div className="grid g3">
            <div className="card">
              <h3>Data pelanggan</h3>
              <dl className="kv mt">
                <dt>WhatsApp</dt><dd>{c.phone || '-'}</dd>
                <dt>Email</dt><dd>{c.email || '-'}</dd>
                <dt>Alamat</dt><dd>{c.address || '-'}</dd>
                <dt>Tanggal pasang</dt><dd>{tgl(c.install_date)}</dd>
                <dt>Lokasi</dt><dd>{c.latitude ? <a className="mono" href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`} target="_blank" rel="noreferrer">{Number(c.latitude).toFixed(6)}, {Number(c.longitude).toFixed(6)}</a> : '-'}</dd>
                <dt>ODP</dt><dd>{c.odp_code ? `${c.odp_code} · ${c.odp_name}` : '-'}</dd>
                <dt>Terdaftar</dt><dd>{tgl(c.created_at)}</dd>
                <dt>Catatan</dt><dd>{c.notes || '-'}</dd>
              </dl>
            </div>
            <div className="card">
              <h3>Layanan</h3>
              <dl className="kv mt">
                <dt>Paket</dt><dd>{c.package_name} ({rupiah(c.package_price)})</dd>
                <dt>Profile</dt><dd className="mono">{c.mikrotik_profile}</dd>
                <dt>Router</dt><dd>{c.router_name}</dd>
                <dt>Password PPPoE</dt><dd className="mono">{c.pppoe_password}</dd>
                <dt>Jatuh tempo</dt><dd>Tanggal {c.billing_day}</dd>
                {c.isolated_at && <><dt>Diisolir sejak</dt><dd>{tgl(c.isolated_at, true)}</dd></>}
              </dl>
            </div>
            <div className="card">
              <h3>ONU</h3>
              {c.onu_sn ? (
                <>
                  <dl className="kv mt">
                    <dt>OLT</dt><dd>{c.olt_name}</dd>
                    <dt>Interface</dt><dd className="mono">gpon-onu_{c.onu_pon}:{c.onu_id}</dd>
                    <dt>SN</dt><dd className="mono">{c.onu_sn}</dd>
                    <dt>Tipe / VLAN</dt><dd>{c.onu_type || '-'} / {c.onu_vlan || '-'}</dd>
                  </dl>
                  {c.olt_type !== 'olt_zte' && <p className="small muted mt">OLT non-ZTE – kelola ONT langsung di perangkat.</p>}
                </>
              ) : <p className="muted">Belum terhubung ONU. Registrasi dari menu OLT ZTE.</p>}
            </div>
          </div>

          <div className="card mt">
            <div className="card-head"><h2>Tagihan</h2>
              <button className="btn sm" onClick={() => {
                const p = prompt('Periode tagihan (YYYY-MM)', new Date().toISOString().slice(0, 7));
                if (p) run(() => api.post('/invoices', { customer_id: c.id, period: p, notify: true }), 'Tagihan dibuat').then(reload);
              }}>+ Buat tagihan</button></div>
            {c.invoices.length ? (
              <div className="table-wrap"><table>
                <thead><tr><th>No.</th><th>Periode</th><th>Jatuh tempo</th><th className="num">Nominal</th><th>Status</th><th>Dibayar</th><th /></tr></thead>
                <tbody>{c.invoices.map((i) => (
                  <tr key={i.id}><td className="mono">{i.invoice_no}</td><td>{periode(i.period)}</td><td>{tgl(i.due_date)}</td><td className="num">{rupiah(i.amount)}</td>
                    <td><Badge s={i.status} /></td><td className="small">{tgl(i.paid_at, true)}</td>
                    <td className="right">{i.status === 'unpaid' && <button className="btn sm ok" onClick={() => setPay(i)}>Bayar</button>}</td></tr>
                ))}</tbody>
              </table></div>
            ) : <Empty text="Belum ada tagihan" />}
          </div>

          <div className="grid g2 mt">
            <div className="card">
              <h2>Riwayat pembayaran</h2>
              {c.payments.length ? <table className="mt"><tbody>{c.payments.map((p) => (
                <tr key={p.id}><td>{tgl(p.paid_at || p.created_at, true)}</td><td>{p.method}{p.channel ? ` · ${p.channel}` : ''}</td><td><Badge s={p.status} /></td><td className="num">{rupiah(p.amount)}</td></tr>
              ))}</tbody></table> : <Empty />}
            </div>
            <div className="card">
              <h2>Log WhatsApp</h2>
              {c.wa_logs.length ? <table className="mt"><tbody>{c.wa_logs.map((w) => (
                <tr key={w.id}><td>{tgl(w.created_at, true)}</td><td>{w.type}</td><td><Badge s={w.status} /></td><td className="small muted">{w.error}</td></tr>
              ))}</tbody></table> : <Empty />}
            </div>
          </div>

          <div className="mt right">
            <button className="btn danger" onClick={() => {
              if (!confirm('Hapus pelanggan dari database? Riwayat tagihan ikut terhapus.')) return;
              const dev = confirm('Hapus juga secret PPPoE di router & ONU di OLT?');
              run(() => api.del(`/customers/${id}?remove_device=${dev ? 1 : 0}`), 'Pelanggan dihapus').then((r) => r && nav('/customers'));
            }}>Hapus pelanggan permanen</button>
          </div>

          {edit && <CustomerForm initial={c} onClose={() => setEdit(false)} onSaved={reload} />}
          {pay && <PayModal invoice={{ ...pay, name: c.name }} onClose={() => setPay(null)} onPaid={reload} />}
          {live && (
            <Modal title="Sesi PPPoE" onClose={() => setLive(null)}>
              {live.active ? (
                <dl className="kv">
                  <dt>Status</dt><dd><span className="badge b-ok">Online</span></dd>
                  <dt>IP address</dt><dd className="mono">{live.active.address}</dd>
                  <dt>Caller ID (MAC)</dt><dd className="mono">{live.active['caller-id']}</dd>
                  <dt>Uptime</dt><dd>{live.active.uptime}</dd>
                  <dt>Profile secret</dt><dd>{live.secret?.profile}</dd>
                </dl>
              ) : <div className="alert warn">Pelanggan sedang offline. Profile secret: <b>{live.secret?.profile || 'secret tidak ditemukan'}</b></div>}
            </Modal>
          )}
          {msg !== null && (
            <Modal title="Kirim WhatsApp" onClose={() => setMsg(null)}
              footer={<button className="btn" disabled={busy || !msg} onClick={() => run(() => api.post(`/customers/${id}/wa`, { message: msg }), 'Pesan terkirim').then((r) => r && setMsg(null))}>Kirim</button>}>
              <Field label="Pesan" hint="Placeholder: {nama} {kode} {username} {password} {paket} {harga}"><textarea value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
            </Modal>
          )}
        </>
      )}
    </Loading>
  );
}
