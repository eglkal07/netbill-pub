import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { tgl } from '../../lib/format.js';
import { COLORS, distance, fmtDistance, gmapsLink } from '../../lib/geo.js';
import { Empty, Field, Loading, Modal, Tabs, useAction, useLoad } from '../../components/ui.jsx';
import { CoordinatePicker } from '../../components/map.jsx';

const usage = (used, cap) => {
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div className="usage" title={`${used} dari ${cap} port`}>
      <div className="usage-bar"><span style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--bad)' : pct >= 70 ? 'var(--warn)' : 'var(--ok)' }} /></div>
      <span className="small">{used}/{cap}</span>
    </div>
  );
};

/** Network & Data: manajemen ODC & ODP */
export default function NetworkAssets() {
  const { can } = useAuth();
  const canEdit = can('network.manage');
  const [tab, setTab] = useState('odc');
  const [q, setQ] = useState('');
  const odcs = useLoad(() => api.get('/network/odcs'));
  const odps = useLoad(() => api.get('/network/odps'));
  const { data: olts } = useLoad(() => (can('network.manage') ? api.get('/devices').then((d) => d.filter((x) => x.type === 'olt_zte' || x.type === 'olt_other')).catch(() => []) : Promise.resolve([])));
  const [form, setForm] = useState(null);
  const [run, busy] = useAction();

  const filter = (list) => (list || []).filter((x) => !q || `${x.code} ${x.name} ${x.address || ''} ${x.odc_code || ''}`.toLowerCase().includes(q.toLowerCase()));
  const reloadAll = () => { odcs.reload(); odps.reload(); };

  const parentOdc = useMemo(() => (odcs.data || []).find((o) => String(o.id) === String(form?.odc_id)), [odcs.data, form?.odc_id]);

  const openOdc = (o) => setForm({ kind: 'odc', ...(o || { code: '', name: '', latitude: '', longitude: '', address: '', capacity: 16, olt_id: '', pon_port: '', notes: '' }) });
  const openOdp = (o) => setForm({ kind: 'odp', ...(o || { odc_id: '', code: '', name: '', latitude: '', longitude: '', address: '', capacity: 8, odc_port: '', notes: '' }) });

  const save = async () => {
    const path = form.kind === 'odc' ? '/network/odcs' : '/network/odps';
    const r = await run(() => (form.id ? api.put(`${path}/${form.id}`, form) : api.post(path, form)), (x) => (form.id ? 'Data disimpan' : `${x.code} ditambahkan`));
    if (r) { setForm(null); reloadAll(); }
  };
  const del = (kind, o) => {
    const msg = kind === 'odc' ? `Hapus ODC ${o.code}?` : `Hapus ODP ${o.code}? Pelanggan yang terhubung akan dilepas dari ODP ini.`;
    if (confirm(msg)) run(() => api.del(`/network/${kind}s/${o.id}`), 'Dihapus').then(reloadAll);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="page-head">
        <div><h1>ODC & ODP</h1><p>Data titik Optical Distribution Cabinet & Optical Distribution Point beserta koordinatnya</p></div>
        <div className="row">
          <Link className="btn ghost" to="/network/map">🗺️ Lihat peta</Link>
          {canEdit && <button className="btn ok" onClick={() => openOdc(null)}>+ ODC</button>}
          {canEdit && <button className="btn warn" onClick={() => openOdp(null)} disabled={!odcs.data?.length} title={!odcs.data?.length ? 'Tambahkan ODC terlebih dahulu' : ''}>+ ODP</button>}
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat" style={{ borderLeft: `4px solid ${COLORS.odc}` }}><div className="label">Total ODC</div><div className="value">{odcs.data?.length ?? '-'}</div></div>
        <div className="stat" style={{ borderLeft: `4px solid ${COLORS.odp}` }}><div className="label">Total ODP</div><div className="value">{odps.data?.length ?? '-'}</div></div>
        <div className="stat"><div className="label">Port ODP terpakai</div><div className="value">{(odps.data || []).reduce((a, b) => a + Number(b.customer_count), 0)} / {(odps.data || []).reduce((a, b) => a + Number(b.capacity), 0)}</div></div>
        <div className="stat"><div className="label">ODP tanpa induk</div><div className="value">{(odps.data || []).filter((o) => !o.odc_id).length}</div></div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Tabs value={tab} onChange={setTab} tabs={[['odc', `ODC (${odcs.data?.length || 0})`], ['odp', `ODP (${odps.data?.length || 0})`]]} />
        <input placeholder="Cari kode / nama / alamat" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
      </div>

      {tab === 'odc' && (
        <Loading loading={odcs.loading && !odcs.data} error={odcs.error}>
          <div className="table-wrap"><table>
            <thead><tr><th>Kode</th><th>Nama</th><th>Koordinat</th><th>Alamat</th><th>Sumber OLT</th><th>ODP / kapasitas</th><th>Dibuat</th><th /></tr></thead>
            <tbody>{filter(odcs.data).map((o) => (
              <tr key={o.id}>
                <td><span className="dot" style={{ background: COLORS.odc }} /> <b className="mono">{o.code}</b></td>
                <td>{o.name}</td>
                <td className="mono small"><a href={gmapsLink(o.latitude, o.longitude)} target="_blank" rel="noreferrer">{Number(o.latitude).toFixed(6)}, {Number(o.longitude).toFixed(6)}</a></td>
                <td className="small" style={{ whiteSpace: 'normal', maxWidth: 240 }}>{o.address || '-'}</td>
                <td className="small">{o.olt_name ? `${o.olt_name}${o.pon_port ? ` · PON ${o.pon_port}` : ''}` : '-'}</td>
                <td>{usage(Number(o.odp_count), Number(o.capacity))}</td>
                <td className="small">{o.created_by_name || '-'}<div className="muted">{tgl(o.created_at)}</div></td>
                <td className="right">{canEdit && <div className="btn-group">
                  <button className="btn sm ghost" onClick={() => openOdc(o)}>Edit</button>
                  <button className="btn sm danger" onClick={() => del('odc', o)}>Hapus</button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table>{!filter(odcs.data).length && <Empty text="Belum ada ODC" />}</div>
        </Loading>
      )}

      {tab === 'odp' && (
        <Loading loading={odps.loading && !odps.data} error={odps.error}>
          <div className="table-wrap"><table>
            <thead><tr><th>Kode</th><th>Nama</th><th>ODC induk</th><th>Jarak ke ODC</th><th>Koordinat</th><th>Alamat</th><th>Pelanggan / port</th><th /></tr></thead>
            <tbody>{filter(odps.data).map((o) => {
              const parent = (odcs.data || []).find((d) => d.id === o.odc_id);
              return (
                <tr key={o.id}>
                  <td><span className="dot" style={{ background: COLORS.odp }} /> <b className="mono">{o.code}</b></td>
                  <td>{o.name}</td>
                  <td>{o.odc_code ? <><span className="mono">{o.odc_code}</span>{o.odc_port && <span className="small muted"> · port {o.odc_port}</span>}</> : <span className="badge b-warn">tanpa induk</span>}</td>
                  <td className="small">{parent ? fmtDistance(distance([+parent.latitude, +parent.longitude], [+o.latitude, +o.longitude])) : '-'}</td>
                  <td className="mono small"><a href={gmapsLink(o.latitude, o.longitude)} target="_blank" rel="noreferrer">{Number(o.latitude).toFixed(6)}, {Number(o.longitude).toFixed(6)}</a></td>
                  <td className="small" style={{ whiteSpace: 'normal', maxWidth: 220 }}>{o.address || '-'}</td>
                  <td>{usage(Number(o.customer_count), Number(o.capacity))}</td>
                  <td className="right">{canEdit && <div className="btn-group">
                    <button className="btn sm ghost" onClick={() => openOdp(o)}>Edit</button>
                    <button className="btn sm danger" onClick={() => del('odp', o)}>Hapus</button>
                  </div>}</td>
                </tr>
              );
            })}</tbody>
          </table>{!filter(odps.data).length && <Empty text="Belum ada ODP" />}</div>
        </Loading>
      )}

      {form && (
        <Modal wide title={`${form.id ? 'Edit' : 'Tambah'} ${form.kind.toUpperCase()}`} onClose={() => setForm(null)}
          footer={<><button className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn" disabled={busy} onClick={save}>Simpan</button></>}>
          <div className="grid g2">
            <div>
              {form.kind === 'odp' && (
                <Field label="ODC induk *" hint="Pilih ODC yang menjadi sumber ODP ini">
                  <select value={form.odc_id || ''} onChange={set('odc_id')}>
                    <option value="">- pilih ODC -</option>
                    {odcs.data?.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name} ({o.odp_count}/{o.capacity})</option>)}
                  </select>
                </Field>
              )}
              <div className="grid g2">
                <Field label="Kode" hint={form.id ? '' : 'Kosongkan untuk otomatis'}><input value={form.code} onChange={set('code')} placeholder={form.kind === 'odc' ? 'ODC-001' : 'ODP-001'} /></Field>
                <Field label="Nama *"><input value={form.name} onChange={set('name')} placeholder={form.kind === 'odc' ? 'ODC Rangas' : 'ODP Jl. Ahmad Yani 01'} /></Field>
                <Field label="Latitude *"><input value={form.latitude} onChange={set('latitude')} placeholder="-2.6786" /></Field>
                <Field label="Longitude *"><input value={form.longitude} onChange={set('longitude')} placeholder="118.8933" /></Field>
                <Field label="Kapasitas port"><select value={form.capacity} onChange={set('capacity')}>{(form.kind === 'odc' ? [8, 16, 24, 32, 48, 72, 96, 144] : [4, 8, 16, 24]).map((n) => <option key={n}>{n}</option>)}</select></Field>
                {form.kind === 'odc' ? (
                  <Field label="Port PON OLT"><input value={form.pon_port || ''} onChange={set('pon_port')} placeholder="1/1/1" /></Field>
                ) : (
                  <Field label="Port di ODC"><input value={form.odc_port || ''} onChange={set('odc_port')} placeholder="mis. 3" /></Field>
                )}
              </div>
              {form.kind === 'odc' && (
                <Field label="OLT sumber">
                  <select value={form.olt_id || ''} onChange={set('olt_id')}><option value="">- tidak ditentukan -</option>{olts?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                </Field>
              )}
              <Field label="Alamat / patokan"><textarea style={{ minHeight: 60 }} value={form.address || ''} onChange={set('address')} /></Field>
              <Field label="Catatan"><input value={form.notes || ''} onChange={set('notes')} /></Field>
            </div>
            <div>
              <CoordinatePicker
                lat={form.latitude} lng={form.longitude} height={380}
                onChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
                line={form.kind === 'odp' && parentOdc ? { lat: +parentOdc.latitude, lng: +parentOdc.longitude, color: COLORS.odc } : null}
                context={[
                  ...(odcs.data || []).filter((o) => !(form.kind === 'odc' && o.id === form.id)).map((o) => ({ lat: +o.latitude, lng: +o.longitude, color: COLORS.odc, label: `${o.code} ${o.name}` })),
                  ...(odps.data || []).filter((o) => !(form.kind === 'odp' && o.id === form.id)).map((o) => ({ lat: +o.latitude, lng: +o.longitude, color: COLORS.odp, label: `${o.code} ${o.name}` }))
                ]}
              />
              {form.kind === 'odp' && parentOdc && form.latitude !== '' && form.longitude !== '' && (
                <div className="alert info mt">Jarak garis lurus ke {parentOdc.code}: <b>{fmtDistance(distance([+parentOdc.latitude, +parentOdc.longitude], [+form.latitude, +form.longitude]))}</b></div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
