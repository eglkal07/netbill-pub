// "Basis data" demo: data awal dari src/data/demo-data.json, perubahan disimpan di localStorage peramban.
// Saat pertama dimuat, semua tanggal digeser ke bulan berjalan agar tagihan & laporan selalu terlihat "baru".
import seed from '../data/demo-data.json';

const KEY = 'netbill.demo-db';
let mem = null;

const DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2})((?: |T)\d{2}:\d{2}(?::\d{2})?)?)?$/;
function shiftValue(v, months) {
  const m = DATE_RE.exec(v);
  if (!m) return v;
  let y = Number(m[1]); let mo = Number(m[2]) - 1 + months;
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  const ym = `${y}-${String(mo + 1).padStart(2, '0')}`;
  if (!m[3]) return ym;
  const dim = new Date(y, mo + 1, 0).getDate();
  return `${ym}-${String(Math.min(Number(m[3]), dim)).padStart(2, '0')}${m[4] || ''}`;
}
function shiftDeep(o, months) {
  if (Array.isArray(o)) return o.map((x) => shiftDeep(x, months));
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shiftDeep(v, months)]));
  return typeof o === 'string' ? shiftValue(o, months) : o;
}

function fresh() {
  const { _keterangan, ...data } = JSON.parse(JSON.stringify(seed)); // eslint-disable-line no-unused-vars
  const a = new Date(seed.anchor_date); const now = new Date();
  const months = (now.getFullYear() - a.getFullYear()) * 12 + (now.getMonth() - a.getMonth());
  const db = months ? shiftDeep(data, months) : data;
  // nomor tagihan memuat periode -> sesuaikan setelah digeser
  for (const i of db.invoices) i.invoice_no = `INV${i.period.replace('-', '')}${String(i.customer_id).padStart(5, '0')}`;
  for (const p of db.payments) if (p.order_id) { const inv = db.invoices.find((x) => x.id === p.invoice_id); p.order_id = `${inv.invoice_no}-DEMO${p.id}`; }
  db.sim.wa = db.sim.wa || { status: 'connected', qr: null, me: '6281200000000' };
  db.version = seed.version;
  return db;
}

export function load() {
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = mem; }
  if (!db || db.version !== seed.version) { db = fresh(); save(db); }
  return db;
}
export function save(db) {
  mem = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* penyimpanan penuh / tidak tersedia */ }
}
export function resetDemo() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('token'); } catch { /* abaikan */ }
  mem = null;
}
export const nextId = (rows) => rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
