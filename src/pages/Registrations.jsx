import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { getSocket } from '../lib/socket.js';
import { tgl } from '../lib/format.js';
import { COLORS, gmapsLink } from '../lib/geo.js';
import { Badge, Empty, Field, Loading, Modal, Tabs, useAction, useLoad } from '../components/ui.jsx';
import { CoordinatePicker } from '../components/map.jsx';
import CustomerForm from './CustomerForm.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { name: '', phone: '', email: '', install_date: today(), address: '', latitude: '', longitude: '', odp_id: '', notes: '' };
const suggestUser = (r) => `${String(r.code).replace(/\D/g, '')}${String(r.name).split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, '')}`;

/**
 * Pendaftaran pelanggan dari lapangan.
 * Teknisi: input data dasar. Operator/admin: lengkapi PPPoE & paket lalu aktivasi.
 */
export default function Registrations() {
  const { can } = useAuth();
  const manage = can('customers.manage');
  const [tab, setTab] = useState(manage ? 'pending' : 'mine');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useLoad(() => api.get('/registrations' + qs({ status: tab === 'pending' ? 'pending' : 'all', q })), [tab, q]);
  const { data: odps } = useLoad(() => api.get('/network/odps').catch(() => []));
  const [form, setForm] = useState(null);
  const [activate, setActivate] = useState(null);
  const [run, busy] = useAction();

  useEffect(() => {
    const s = getSocket();
    s.on('registration:new', reload); s.on('registration:updated', reload);
    return () => { s.off('registration:new', reload); s.off('registration:updated', reload); };
  }, [reload]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    const r = await run(() => (form.id ? api.put('/registrations/' + form.id, form) : api.post('/registrations', form)),
      (x) => (form.id ? 'Data diperbarui' : `Pendaftaran ${x.code} terkirim ke operator`));
    if (r) { setForm(null); reload(); }
  };
  const gps = () => navigator.geolocation?.getCurrentPosition(
    (p) => setForm((f) => ({ ...f, latitude: Number(p.coords.latitude.toFixed(7)), longitude: Number(p.coords.longitude.toFixed(7)) })),
    (e) => alert('Gagal mengambil lokasi: ' + e.message), { enableHighAccuracy: true, timeout: 15000 });
  const selectedOdp = odps?.find((o) => String(o.id) === String(form?.odp_id));

  return (
    <>
      <div className="page-head">
        <div><h1>Pendaftaran Pelanggan</h1><p>{manage ? 'Data dari teknisi lapangan yang perlu dilengkapi & diaktivasi' : 'Input data pelanggan baru di lapangan, lalu operator akan mengaktivasi'}</p></div>
        <button className="btn" onClick={() => { setForm({ ...EMPTY }); setTimeout(gps, 300); }}>+ Pendaftaran baru</button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Tabs value={tab} onChange={setTab} tabs={manage ? [['pending', 'Menunggu aktivasi'], ['all', 'Semua dari teknisi']] : [['mine', 'Pendaftaran saya']]} />
        <input placeholder="Cari nama / HP / ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
      </div>
      <Loading loading={loading && !data} error={error}>
        <div className="table-wrap"><table>
          <thead><tr><th>Pelanggan</th><th>Kontak</th><th>Tgl pasang / tempo</th><th>Alamat & lokasi</th><th>ODP</th><th>Diinput oleh</th><th>Status</th><th /></tr></thead>
          <tbody>{data?.map((r) => (
            <tr key={r.id}>
              <td><b>{r.name}</b><div className="small muted">{r.code}</div></td>
              <td className="small">{r.phone}<div className="muted">{r.email || '-'}</div></td>
              <td className="small">{tgl(r.install_date)}<div className="muted">jatuh tempo tgl {r.billing_day}</div></td>
              <td className="small" style={{ whiteSpace: 'normal', maxWidth: 260 }}>{r.address}
                {r.latitude && <div><a href={gmapsLink(r.latitude, r.longitude)} target="_blank" rel="noreferrer" className="mono">{Number(r.latitude).toFixed(6)}, {Number(r.longitude).toFixed(6)}</a></div>}</td>
              <td className="small">{r.odp_code ? `${r.odp_code} · ${r.odp_name}` : '-'}</td>
              <td className="small">{r.created_by_name || '-'}<div className="muted">{tgl(r.created_at, true)}</div></td>
              <td>{r.status === 'pending' ? <span className="badge b-warn">Menunggu aktivasi</span> : <Badge s={r.status} />}{r.activated_at && <div className="small muted">{tgl(r.activated_at)}</div>}</td>
              <td className="right">{r.status === 'pending' && (
                <div className="btn-group">
                  {manage && <button className="btn sm ok" onClick={() => setActivate({ ...r, install_date: r.install_date ? String(r.install_date).slice(0, 10) : '', pppoe_username: suggestUser(r), send_wa: true, create_first_invoice: false })}>Lengkapi & aktivasi</button>}
                  <button className="btn sm ghost" onClick={() => setForm({ ...r, install_date: String(r.install_date || '').slice(0, 10), odp_id: r.odp_id || '' })}>Edit</button>
                  <button className="btn sm danger" onClick={() => confirm(`Hapus pendaftaran ${r.name}?`) && run(() => api.del('/registrations/' + r.id), 'Dihapus').then(reload)}>Hapus</button>
                </div>
              )}</td>
            </tr>
          ))}</tbody>
        </table>{!data?.length && <Empty text={tab === 'pending' ? 'Tidak ada pendaftaran yang menunggu' : 'Belum ada data'} />}</div>
      </Loading>

      {form && (
        <Modal wide title={form.id ? `Edit pendaftaran ${form.code}` : 'Pendaftaran pelanggan baru'} onClose={() => setForm(null)}
          footer={<><button className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn" disabled={busy} onClick={save}>{form.id ? 'Simpan' : 'Kirim ke operator'}</button></>}>
          <div className="grid g2">
            <div>
              <Field label="Nama lengkap *"><input value={form.name} onChange={set('name')} /></Field>
              <Field label="No. WhatsApp *" hint="Detail akun akan dikirim ke nomor ini saat aktivasi"><input inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxxxx" /></Field>
              <Field label="Email"><input type="email" value={form.email || ''} onChange={set('email')} /></Field>
              <Field label="Tanggal pasang *" hint={form.install_date ? `Jatuh tempo setiap tanggal ${Math.min(28, new Date(form.install_date).getDate())}` : ''}>
                <input type="date" value={form.install_date} onChange={set('install_date')} />
              </Field>
              <Field label="Alamat *"><textarea style={{ minHeight: 70 }} value={form.address} onChange={set('address')} /></Field>
              <Field label="ODP terdekat" hint="Opsional – ODP tempat pelanggan disambungkan">
                <select value={form.odp_id || ''} onChange={set('odp_id')}>
                  <option value="">- pilih ODP -</option>
                  {odps?.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name} ({o.customer_count}/{o.capacity})</option>)}
                </select>
              </Field>
              <Field label="Catatan"><input value={form.notes || ''} onChange={set('notes')} placeholder="mis. patokan rumah, paket yang diminta" /></Field>
            </div>
            <div>
              <div className="grid g2">
                <Field label="Latitude *"><input value={form.latitude} onChange={set('latitude')} /></Field>
                <Field label="Longitude *"><input value={form.longitude} onChange={set('longitude')} /></Field>
              </div>
              <CoordinatePicker lat={form.latitude} lng={form.longitude} height={340}
                onChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
                context={(odps || []).map((o) => ({ lat: +o.latitude, lng: +o.longitude, color: COLORS.odp, label: `${o.code} ${o.name}` }))}
                line={selectedOdp ? { lat: +selectedOdp.latitude, lng: +selectedOdp.longitude, color: COLORS.odp } : null} />
            </div>
          </div>
        </Modal>
      )}

      {activate && <CustomerForm initial={activate} activateId={activate.id} onClose={() => setActivate(null)} onSaved={reload} />}
    </>
  );
}
