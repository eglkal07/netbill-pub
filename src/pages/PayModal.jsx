import { useState } from 'react';
import { api } from '../lib/api.js';
import { rupiah, periode } from '../lib/format.js';
import { Field, Modal, useAction } from '../components/ui.jsx';

/** Modal pembayaran manual oleh admin, atau buat link Midtrans */
export default function PayModal({ invoice, onClose, onPaid }) {
  const [f, setF] = useState({ channel: 'tunai', note: '' });
  const [link, setLink] = useState(null);
  const [run, busy] = useAction();

  const pay = async () => {
    const r = await run(() => api.post(`/invoices/${invoice.id}/pay`, f), (x) => `Pembayaran dicatat${x.activated ? ' · PPPoE diaktifkan kembali' : ''}`);
    if (r) { if (r.activationError) alert('Aktivasi PPPoE gagal: ' + r.activationError); onPaid?.(); onClose(); }
  };
  const online = async () => {
    const r = await run(() => api.post(`/invoices/${invoice.id}/online`));
    if (r) setLink(r.redirect_url);
  };

  return (
    <Modal title="Pembayaran Tagihan" onClose={onClose}
      footer={<><button className="btn ghost" disabled={busy} onClick={online}>Link Midtrans</button><button className="btn ok" disabled={busy} onClick={pay}>Konfirmasi bayar manual</button></>}>
      <dl className="kv">
        <dt>Pelanggan</dt><dd>{invoice.name}</dd>
        <dt>No. tagihan</dt><dd className="mono">{invoice.invoice_no}</dd>
        <dt>Periode</dt><dd>{periode(invoice.period)}</dd>
        <dt>Nominal</dt><dd style={{ fontSize: 18 }}>{rupiah(invoice.amount)}</dd>
      </dl>
      <div className="mt" />
      <Field label="Metode bayar manual">
        <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
          <option value="tunai">Tunai</option><option value="transfer">Transfer bank</option><option value="qris">QRIS (manual)</option><option value="lainnya">Lainnya</option>
        </select>
      </Field>
      <Field label="Catatan"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {link && (
        <div className="alert info">
          Link pembayaran online: <a href={link} target="_blank" rel="noreferrer">{link}</a>
          <div className="mt"><button className="btn sm ghost" onClick={() => navigator.clipboard.writeText(link)}>Salin link</button></div>
        </div>
      )}
    </Modal>
  );
}
