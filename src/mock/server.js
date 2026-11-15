// Titik masuk API tiruan: cocokkan rute, periksa sesi & hak akses (RBAC), lalu simpan perubahan.
import { load, save } from './db.js';
import { routes, HttpError } from './core.js';
import { permissionsOf } from './settings.js';
import { uidFromToken } from './routes-a.js';
import { settleDemoPayment, runDailyJobs } from './routes-b.js';

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

export async function handle(method, fullPath, body, token) {
  const [path, qs = ''] = fullPath.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  try {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const db = load();
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      let user = null; let perms = [];
      if (r.perms !== null) {
        const uid = uidFromToken(token);
        const u = uid && db.users.find((x) => x.id === uid);
        if (!uid) throw new HttpError(401, 'Sesi berakhir, silakan login ulang');
        if (!u || !u.is_active) throw new HttpError(401, 'Akun tidak aktif');
        user = { id: u.id, username: u.username, name: u.name, role: u.role, type: 'admin' };
        perms = permissionsOf(db, u.role);
        if (r.perms.length && !r.perms.some((k) => perms.includes(k))) throw new HttpError(403, 'Anda tidak memiliki hak akses untuk fitur ini');
      }
      if (user) { const before = db.sim.jobs_ran; runDailyJobs(db); if (before !== db.sim.jobs_ran) save(db); }
      const can = (k) => perms.includes(k);
      const out = await r.fn({ db, user, perms, can, body: clone(body) || {}, query, params });
      if (method !== 'GET' || path.startsWith('/devices') || path.startsWith('/olt')) save(db);
      return { status: 200, body: clone(out) };
    }
    throw new HttpError(404, 'Endpoint tidak ditemukan');
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { message: e.message } };
    console.error('[demo-api]', e);
    return { status: 500, body: { message: e.message || 'Terjadi kesalahan pada data demo' } };
  }
}

// Halaman simulasi Midtrans (tab lain) mengirim konfirmasi bayar lewat BroadcastChannel
try {
  const ch = new BroadcastChannel('netbill.midtrans-demo');
  ch.onmessage = (e) => {
    const { order_id: orderId, channel } = e.data || {};
    if (!orderId) return;
    const db = load();
    try { const r = settleDemoPayment(db, orderId, channel); if (r) { save(db); ch.postMessage({ ack: orderId }); } } catch (err) { console.error(err); }
  };
} catch { /* BroadcastChannel tidak tersedia */ }
