// Utilitas bersama API tiruan: galat HTTP, router, tanggal, helper teks, dan bus realtime (pengganti Socket.IO).
import { nextId } from './db.js';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, msg) => { throw new HttpError(status, msg); };

/* ---------- Router ---------- */
export const routes = [];
/** perms: null = publik, [] = cukup login, ['a','b'] = salah satu izin */
export function route(method, path, perms, fn) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, perms, fn });
}

/* ---------- Tanggal (waktu lokal, format MySQL) ---------- */
const p2 = (n) => String(n).padStart(2, '0');
export const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
export const now = () => fmt(new Date());
export const today = () => now().slice(0, 10);
export const thisPeriod = () => now().slice(0, 7);
export const parse = (s) => new Date(String(s).replace(' ', 'T'));
export const addDays = (dateStr, n) => { const d = parse(dateStr.slice(0, 10) + ' 00:00:00'); d.setDate(d.getDate() + n); return fmt(d).slice(0, 10); };
export const addMonths = (period, n) => { const [y, m] = period.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
export const daysBetween = (a, b) => Math.round((parse(b.slice(0, 10) + ' 00:00:00') - parse(a.slice(0, 10) + ' 00:00:00')) / 864e5);
export function dueDateFor(period, billingDay) {
  const [y, m] = period.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  return `${period}-${p2(Math.min(Number(billingDay) || 1, dim))}`;
}

/* ---------- Helper teks ---------- */
export const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const periodLabel = (p) => { const [y, m] = String(p).split('-'); return `${BULAN[Number(m) - 1]} ${y}`; };
export const dateLabel = (d) => { const x = parse(d); return `${x.getDate()} ${BULAN[x.getMonth()]} ${x.getFullYear()}`; };
export function normalizePhone(p) {
  if (!p) return '';
  let s = String(p).replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1); else if (s.startsWith('8')) s = '62' + s;
  return s;
}
export function randomString(len = 6, chars = 'abcdefghjkmnpqrstuvwxyz23456789') {
  const b = crypto.getRandomValues(new Uint8Array(len));
  let out = ''; for (let i = 0; i < len; i++) out += chars[b[i] % chars.length];
  return out;
}
export const fillTemplate = (tpl, data) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (data[k] !== undefined && data[k] !== null ? String(data[k]) : m));
export const like = (q, ...vals) => !q || vals.some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(String(q).toLowerCase()));
export const eq = (a, b) => String(a) === String(b);
export const num = (v) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? null : Number(v));
export const sortBy = (rows, fn, desc = false) => rows.sort((a, b) => { const x = fn(a), y = fn(b); const r = x < y ? -1 : x > y ? 1 : 0; return desc ? -r : r; });

export function insert(db, table, row) { const r = { id: nextId(db[table]), ...row }; db[table].push(r); return r; }
export function logActivity(db, actor, action, detail = '', userId = null) {
  insert(db, 'activity_logs', { user_id: userId, actor, action, detail: typeof detail === 'string' ? detail : JSON.stringify(detail), created_at: now() });
}

/* ---------- Bus realtime (pengganti Socket.IO) ---------- */
const listeners = new Map();
let channel = null;
try { channel = new BroadcastChannel('netbill.realtime'); channel.onmessage = (e) => dispatch(e.data.event, e.data.data); } catch { channel = null; }
function dispatch(event, data) { for (const fn of [...(listeners.get(event) || [])]) { try { fn(data); } catch (e) { console.error(e); } } }
export const bus = {
  on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
  off(event, fn) { listeners.get(event)?.delete(fn); },
  dispatch,
};
/** Kirim event ke semua "admin" yang terhubung: tab ini + tab lain di peramban yang sama */
export function emit(event, data) {
  setTimeout(() => dispatch(event, data), 0);
  try { channel?.postMessage({ event, data }); } catch { /* abaikan */ }
}
