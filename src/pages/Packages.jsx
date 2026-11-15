import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { rupiah } from '../lib/format.js';
import { DeviceSelect, Empty, Field, Loading, Modal, useAction, useLoad } from '../components/ui.jsx';

export default function Packages() {
  const { data, loading, error, reload } = useLoad(() => api.get('/packages'));
  const { data: devices } = useLoad(() => api.get('/devices?type=mikrotik'));
  const [form, setForm] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [run, busy] = useAction();

  useEffect(() => {
    if (form?.router_id) api.get(`/devices/${form.router_id}/ppp-profiles`).then(setProfiles).catch(() => setProfiles([]));
    else setProfiles([]);
  }, [form?.router_id]);

  const save = async () => {
    const r = await run(() => (form.id ? api.put('/packages/' + form.id, form) : api.post('/packages', form)), 'Paket disimpan');
    if (r) { setForm(null); reload(); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Paket Internet</h1><p>Paket terhubung ke profile PPP di MikroTik</p></div>
        <button className="btn" onClick={() => setForm({ name: '', price: '', router_id: '', mikrotik_profile: '', rate_limit: '', description: '' })}>+ Tambah Paket</button>
      </div>
      <Loading loading={loading} error={error}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th className="num">Harga / bulan</th><th>Profile MikroTik</th><th>Kecepatan</th><th>Router</th><th className="num">Pelanggan</th><th /></tr></thead>
            <tbody>{data?.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b>{p.description && <div className="small muted">{p.description}</div>}</td>
                <td className="num">{rupiah(p.price)}</td>
                <td className="mono">{p.mikrotik_profile}</td>
                <td>{p.rate_limit || '-'}</td>
                <td>{p.router_name || 'Semua'}</td>
                <td className="num">{p.customer_count}</td>
                <td className="right"><div className="btn-group">
                  <button className="btn sm ghost" onClick={() => setForm({ ...p })}>Edit</button>
                  <button className="btn sm danger" onClick={() => confirm('Hapus paket?') && run(() => api.del('/packages/' + p.id), 'Dihapus').then(reload)}>Hapus</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.length && <Empty />}
        </div>
      </Loading>
      {form && (
        <Modal title={form.id ? 'Edit Paket' : 'Tambah Paket'} onClose={() => setForm(null)}
          footer={<><button className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn" disabled={busy} onClick={save}>Simpan</button></>}>
          <Field label="Nama paket"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Home 20 Mbps" /></Field>
          <Field label="Harga per bulan (Rp)"><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Router" hint="Pilih router untuk mengambil daftar profile PPP"><DeviceSelect devices={devices} value={form.router_id} onChange={(v) => setForm({ ...form, router_id: v })} placeholder="- semua router -" /></Field>
          <Field label="Profile PPP MikroTik">
            <input list="pp" value={form.mikrotik_profile} onChange={(e) => setForm({ ...form, mikrotik_profile: e.target.value })} placeholder="nama profile di /ppp profile" />
            <datalist id="pp">{profiles.map((p) => <option key={p['.id']} value={p.name}>{p['rate-limit']}</option>)}</datalist>
          </Field>
          <Field label="Kecepatan (info)"><input value={form.rate_limit || ''} onChange={(e) => setForm({ ...form, rate_limit: e.target.value })} placeholder="20M/20M" /></Field>
          <Field label="Deskripsi"><input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}
