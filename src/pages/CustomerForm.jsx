import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { rupiah } from '../lib/format.js';
import { DeviceSelect, Field, Modal, useAction, useLoad } from '../components/ui.jsx';
import { CoordinatePicker } from '../components/map.jsx';
import { COLORS } from '../lib/geo.js';

const rand = (n = 8) => Math.random().toString(36).slice(2, 2 + n);

/** activateId: aktivasi pendaftaran dari teknisi (status pending) */
export default function CustomerForm({ initial, onClose, onSaved, activateId }) {
  const isEdit = !!initial?.id && !activateId;
  const { data: devices } = useLoad(() => api.get('/devices'));
  const { data: packages } = useLoad(() => api.get('/packages'));
  const { data: odps } = useLoad(() => api.get('/network/odps').catch(() => []));
  const [uncfg, setUncfg] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [f, setF] = useState(() => ({
    name: '', phone: '', email: '', address: '', router_id: '', package_id: '', pppoe_username: '', pppoe_password: rand(),
    remote_address: '', local_address: '', billing_day: new Date().getDate() > 28 ? 1 : new Date().getDate(), notes: '',
    olt_id: '', onu_pon: '', onu_id: '', onu_sn: '', onu_type: '', onu_vlan: '',
    register_onu: false, send_wa: true, create_first_invoice: false, sync_olt: false,
    install_date: '', latitude: '', longitude: '', odp_id: '',
    ...initial
  }));
  // ubah tanggal pasang -> tanggal jatuh tempo
  const setInstall = (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, install_date: v, billing_day: v ? Math.min(28, new Date(v).getDate()) : x.billing_day }));
  };
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // pilih paket -> isi router default
  useEffect(() => {
    const p = packages?.find((x) => String(x.id) === String(f.package_id));
    if (p?.router_id && !f.router_id) setF((x) => ({ ...x, router_id: String(p.router_id) }));
  }, [f.package_id, packages]); // eslint-disable-line react-hooks/exhaustive-deps

  const selOlt = devices?.find((d) => String(d.id) === String(f.olt_id));
  const zte = selOlt?.type === 'olt_zte';
  const loadUncfg = async () => {
    if (!f.olt_id) return alert('Pilih OLT dulu');
    const r = await run(() => api.get(`/olt/${f.olt_id}/uncfg`));
    if (r) setUncfg(r);
  };

  const save = async () => {
    const body = { ...f };
    const r = await run(
      () => (activateId ? api.post(`/registrations/${activateId}/activate`, body) : isEdit ? api.put('/customers/' + f.id, body) : api.post('/customers', body)),
      (x) => (isEdit ? 'Pelanggan diperbarui' : `Pelanggan ${x.code} ${activateId ? 'diaktivasi' : 'dibuat'}${x.app_password ? ' · password aplikasi: ' + x.app_password : ''}${x.wa?.ok ? ' · detail akun dikirim via WA' : ''}`)
    );
    if (r) { onSaved?.(r); onClose(); }
  };

  return (
    <Modal wide title={activateId ? `Lengkapi & Aktivasi ${initial.code}` : isEdit ? `Edit ${initial.code}` : 'Tambah Pelanggan PPPoE'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Batal</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Menyimpan...' : activateId ? 'Aktivasi pelanggan' : 'Simpan'}</button></>}>
      {activateId && (
        <div className="alert info">Pendaftaran dari teknisi <b>{initial.created_by_name}</b>. Lengkapi paket, router & PPPoE lalu klik <b>Aktivasi</b> — secret PPPoE akan dibuat di MikroTik dan detail akun dikirim via WhatsApp.</div>
      )}
      <fieldset>
        <legend>Data pelanggan</legend>
        <div className="grid g2">
          <Field label="Nama lengkap"><input value={f.name} onChange={set('name')} /></Field>
          <Field label="No. WhatsApp" hint="Format 08xx / 628xx"><input value={f.phone || ''} onChange={set('phone')} /></Field>
          <Field label="Email"><input value={f.email || ''} onChange={set('email')} /></Field>
          <Field label="Tanggal pasang"><input type="date" value={f.install_date ? String(f.install_date).slice(0, 10) : ''} onChange={setInstall} /></Field>
          <Field label="Tanggal jatuh tempo" hint="Setiap bulan (1–28), otomatis dari tanggal pasang"><input type="number" min="1" max="28" value={f.billing_day} onChange={set('billing_day')} /></Field>
        </div>
        <Field label="Alamat"><input value={f.address || ''} onChange={set('address')} /></Field>
        <div className="grid g3">
          <Field label="Latitude"><input value={f.latitude ?? ''} onChange={set('latitude')} /></Field>
          <Field label="Longitude"><input value={f.longitude ?? ''} onChange={set('longitude')} /></Field>
          <Field label="ODP">
            <select value={f.odp_id || ''} onChange={set('odp_id')}>
              <option value="">- belum ditentukan -</option>
              {odps?.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name} ({o.customer_count}/{o.capacity})</option>)}
            </select>
          </Field>
        </div>
        <button type="button" className="btn link small" style={{ marginBottom: 10 }} onClick={() => setShowMap(!showMap)}>{showMap ? 'Sembunyikan peta' : '🗺️ Pilih titik di peta'}</button>
        {showMap && (
          <CoordinatePicker lat={f.latitude} lng={f.longitude} height={260}
            onChange={(lat, lng) => setF((x) => ({ ...x, latitude: lat, longitude: lng }))}
            context={(odps || []).map((o) => ({ lat: +o.latitude, lng: +o.longitude, color: COLORS.odp, label: `${o.code} ${o.name}` }))}
            line={(() => { const o = odps?.find((x) => String(x.id) === String(f.odp_id)); return o ? { lat: +o.latitude, lng: +o.longitude, color: COLORS.odp } : null; })()} />
        )}
      </fieldset>

      <fieldset>
        <legend>PPPoE MikroTik</legend>
        <div className="grid g2">
          <Field label="Paket">
            <select value={f.package_id || ''} onChange={set('package_id')}>
              <option value="">- pilih paket -</option>
              {packages?.map((p) => <option key={p.id} value={p.id}>{p.name} – {rupiah(p.price)} ({p.mikrotik_profile})</option>)}
            </select>
          </Field>
          <Field label="Router MikroTik"><DeviceSelect devices={devices} type="mikrotik" value={f.router_id} onChange={(v) => setF({ ...f, router_id: v })} /></Field>
          <Field label="Username PPPoE"><input value={f.pppoe_username} onChange={set('pppoe_username')} /></Field>
          <Field label="Password PPPoE"><div className="row"><input className="grow" value={f.pppoe_password} onChange={set('pppoe_password')} /><button type="button" className="btn ghost sm" onClick={() => setF({ ...f, pppoe_password: rand() })}>Acak</button></div></Field>
          <Field label="Remote address (opsional)" hint="IP statis pelanggan"><input value={f.remote_address || ''} onChange={set('remote_address')} /></Field>
          <Field label="Local address (opsional)"><input value={f.local_address || ''} onChange={set('local_address')} /></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>ONU / OLT ZTE (opsional)</legend>
        <div className="grid g3">
          <Field label="OLT"><DeviceSelect devices={devices} type={['olt_zte', 'olt_other']} value={f.olt_id} onChange={(v) => setF((x) => ({ ...x, olt_id: v, register_onu: false, sync_olt: false }))} placeholder="- tanpa OLT -" /></Field>
          <Field label="Port PON" hint="rack/shelf/slot, mis. 1/1/1"><input value={f.onu_pon || ''} onChange={set('onu_pon')} placeholder="1/1/1" /></Field>
          <Field label="ONU ID" hint="Kosong = otomatis"><input value={f.onu_id || ''} onChange={set('onu_id')} /></Field>
          <Field label="SN ONU"><div className="row"><input className="grow" value={f.onu_sn || ''} onChange={set('onu_sn')} placeholder="ZTEGC1234567" />{zte && <button type="button" className="btn ghost sm" onClick={loadUncfg}>Cari</button>}</div></Field>
          <Field label="Tipe ONU"><input value={f.onu_type || ''} onChange={set('onu_type')} placeholder="ALL" /></Field>
          <Field label="VLAN"><input value={f.onu_vlan || ''} onChange={set('onu_vlan')} placeholder="20" /></Field>
        </div>
        {uncfg && (
          <div className="alert info">
            {uncfg.length ? <>ONU belum terdaftar: {uncfg.map((u) => (
              <button key={u.sn} type="button" className="btn sm ghost" style={{ margin: 3 }} onClick={() => { setF({ ...f, onu_sn: u.sn, onu_pon: u.pon }); setUncfg(null); }}>{u.pon} · {u.sn}</button>
            ))}</> : 'Tidak ada ONU baru (uncfg) di OLT ini'}
          </div>
        )}
        {selOlt && !zte && <div className="alert info">{selOlt.name} ({selOlt.vendor || 'OLT non-ZTE'}) tidak dikonfigurasi lewat aplikasi – langkah aktivasi ONT dilewati. Data ONU di atas hanya disimpan sebagai catatan; atur PPPoE langsung di ONT.</div>}
        {zte && !isEdit && <label className="check"><input type="checkbox" checked={f.register_onu} onChange={set('register_onu')} />Aktivasi ONT di OLT ZTE sekarang (onu type ALL, gpon-onu, pon-onu-mng + PPPoE sesuai template)</label>}
        {zte && isEdit && <label className="check"><input type="checkbox" checked={f.sync_olt} onChange={set('sync_olt')} />Sinkronkan username/password PPPoE ke ONT</label>}
      </fieldset>

      {!isEdit && (
        <fieldset>
          <legend>Lainnya</legend>
          <label className="check"><input type="checkbox" checked={f.send_wa} onChange={set('send_wa')} />Kirim detail akun & password aplikasi via WhatsApp</label>
          <label className="check"><input type="checkbox" checked={f.create_first_invoice} onChange={set('create_first_invoice')} />Buat tagihan bulan ini sekarang</label>
        </fieldset>
      )}
      <Field label="Catatan"><input value={f.notes || ''} onChange={set('notes')} /></Field>
    </Modal>
  );
}
