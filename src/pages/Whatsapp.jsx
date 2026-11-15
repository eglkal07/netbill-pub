import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { tgl } from '../lib/format.js';
import { Badge, Field, Loading, Tabs, useAction, useLoad } from '../components/ui.jsx';

export default function Whatsapp() {
  const [tab, setTab] = useState('conn');
  const { data: settings } = useLoad(() => api.get('/settings'));
  const { data: st, setData: setSt } = useLoad(() => api.get('/whatsapp/status'));
  const { data: logs, loading, error, reload } = useLoad(() => api.get('/whatsapp/logs'));
  const [test, setTest] = useState({ phone: '', message: 'Tes pesan dari NetBill ✅' });
  const [bc, setBc] = useState({ status: 'active', message: 'Halo {nama}, ' });
  const [run, busy] = useAction();

  useEffect(() => {
    const s = getSocket();
    s.on('wa:status', setSt);
    return () => s.off('wa:status', setSt);
  }, [setSt]);

  const provider = settings?.wa_provider;

  return (
    <>
      <div className="page-head"><div><h1>WhatsApp</h1><p>Notifikasi akun, tagihan, pengingat H-5 jatuh tempo, isolir & pembayaran</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['conn', 'Koneksi'], ['broadcast', 'Broadcast'], ['logs', 'Log pesan']]} />

      {tab === 'conn' && (
        <div className="grid g2">
          <div className="card">
            <h3>Provider: <span className="badge b-info">{provider || '-'}</span></h3>
            <p className="small muted">Provider, nomor pengirim & template pesan diatur oleh admin. Operator dapat mengirim pesan sesuai pengaturan tersebut.</p>
            {provider === 'baileys' ? (
              <>
                <p>Status: <Badge s={st?.status === 'connected' ? 'online' : 'offline'} label={st?.status} /> {st?.me && <span className="mono">+{st.me}</span>}</p>
                {st?.status !== 'connected' && <div className="alert warn mt">WhatsApp belum terhubung. Hubungi admin untuk menghubungkan nomor pengirim.</div>}
              </>
            ) : provider === 'none' ? <div className="alert warn">Provider WhatsApp belum dipilih.</div> : <div className="alert info">Menggunakan gateway HTTP ({provider}). Tidak perlu scan QR.</div>}
          </div>
          <div className="card">
            <h3>Tes kirim pesan</h3>
            <div className="mt" />
            <Field label="Nomor tujuan"><input value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} placeholder="08xxxxxxxxxx" /></Field>
            <Field label="Pesan"><textarea value={test.message} onChange={(e) => setTest({ ...test, message: e.target.value })} /></Field>
            <button className="btn" disabled={busy || !test.phone} onClick={() => run(() => api.post('/whatsapp/test', test), 'Pesan terkirim').then(reload)}>Kirim tes</button>
          </div>
        </div>
      )}

      {tab === 'broadcast' && (
        <div className="card" style={{ maxWidth: 680 }}>
          <Field label="Kirim ke pelanggan">
            <select value={bc.status} onChange={(e) => setBc({ ...bc, status: e.target.value })}>
              <option value="">Semua pelanggan</option><option value="active">Aktif</option><option value="isolated">Terisolir</option>
            </select>
          </Field>
          <Field label="Pesan" hint="Placeholder: {nama} {kode} {username} {paket} {harga} {perusahaan}"><textarea style={{ minHeight: 160 }} value={bc.message} onChange={(e) => setBc({ ...bc, message: e.target.value })} /></Field>
          <div className="alert warn">Pesan dikirim dengan jeda 1,5 detik per pelanggan untuk menghindari blokir.</div>
          <button className="btn" disabled={busy} onClick={() => confirm('Kirim broadcast?') && run(() => api.post('/whatsapp/broadcast', bc), (r) => `Terkirim ${r.sent}, gagal ${r.failed}`)}>{busy ? 'Mengirim...' : 'Kirim broadcast'}</button>
        </div>
      )}

      {tab === 'logs' && (
        <Loading loading={loading} error={error}>
          <div className="table-wrap"><table>
            <thead><tr><th>Waktu</th><th>Tujuan</th><th>Jenis</th><th>Status</th><th>Pesan</th></tr></thead>
            <tbody>{logs?.map((l) => (
              <tr key={l.id}><td>{tgl(l.created_at, true)}</td><td>{l.name ? `${l.name} ` : ''}<span className="mono small">{l.phone}</span></td><td>{l.type}</td>
                <td><Badge s={l.status} />{l.error && <div className="small" style={{ color: 'var(--bad)', whiteSpace: 'normal', maxWidth: 260 }}>{l.error}</div>}</td>
                <td className="small" style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{l.message.slice(0, 200)}{l.message.length > 200 ? '…' : ''}</td></tr>
            ))}</tbody>
          </table></div>
        </Loading>
      )}
    </>
  );
}
