// Rute API tiruan bagian 2: network & peta, ONU belum terdaftar, tagihan, pembayaran, laporan, WhatsApp, pengaturan.
import { route, fail, now, today, thisPeriod, addDays, addMonths, like, eq, sortBy, insert, logActivity, emit, fillTemplate, num } from './core.js';
import { DEFAULT_SETTINGS, getAllSettings, setSettings, maskSecrets } from './settings.js';
import { zte, sendWhatsapp, waStatus } from './sim.js';
import { getCustomer, getDevice, createInvoice, markInvoicePaid, notify, payLink, createOnlinePayment, generateInvoices, runAutoIsolir, runReminders,
  runAutoDelete, templateData } from './services.js';

const wrap = (fn) => { try { return fn(); } catch (e) { if (e.status) throw e; return fail(502, e.message); } };

/* ======================= Network & Data ======================= */
const NV = ['network.view', 'network.manage']; const NM = ['network.manage'];
function coords(b) {
  const lat = Number(b.latitude); const lng = Number(b.longitude);
  if (b.latitude === '' || b.longitude === '' || b.latitude == null || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'Titik koordinat (latitude & longitude) tidak valid');
  return [lat, lng];
}
const autoCode = (rows, prefix) => `${prefix}-${String(rows.reduce((m, r) => { const x = new RegExp(`^${prefix}-(\\d+)$`).exec(r.code); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1).padStart(3, '0')}`;
const uniqueCode = (rows, code, id = 0) => { if (rows.some((r) => r.code === code && r.id !== Number(id))) fail(400, `Kode ${code} sudah dipakai`); };
const userName = (db, id) => db.users.find((u) => u.id === id)?.name ?? null;

route('GET', '/network/odcs', NV, ({ db }) => sortBy(db.odcs.map((d) => ({ ...d, olt_name: getDevice(db, d.olt_id)?.name ?? null, created_by_name: userName(db, d.created_by),
  odp_count: db.odps.filter((p) => p.odc_id === d.id).length })), (d) => d.code));
route('POST', '/network/odcs', NM, ({ db, body: b, user }) => {
  if (!b.name) fail(400, 'Nama ODC wajib diisi');
  const [lat, lng] = coords(b); const code = (b.code || '').trim() || autoCode(db.odcs, 'ODC'); uniqueCode(db.odcs, code);
  const x = insert(db, 'odcs', { code, name: b.name, latitude: lat, longitude: lng, address: b.address || null, capacity: Number(b.capacity) || 16, olt_id: num(b.olt_id),
    pon_port: b.pon_port || null, notes: b.notes || null, created_by: user.id, created_at: now(), updated_at: now() });
  logActivity(db, user.username, 'tambah_odc', `${code} ${b.name}`, user.id);
  return { id: x.id, code };
});
route('PUT', '/network/odcs/:id', NM, ({ db, body: b, params, user }) => {
  if (!b.name || !b.code) fail(400, 'Kode & nama ODC wajib diisi');
  const [lat, lng] = coords(b); uniqueCode(db.odcs, b.code, params.id);
  Object.assign(db.odcs.find((d) => d.id === Number(params.id)) || fail(404, 'ODC tidak ditemukan'), { code: b.code, name: b.name, latitude: lat, longitude: lng,
    address: b.address || null, capacity: Number(b.capacity) || 16, olt_id: num(b.olt_id), pon_port: b.pon_port || null, notes: b.notes || null, updated_at: now() });
  logActivity(db, user.username, 'ubah_odc', b.code, user.id);
  return { ok: true };
});
route('DELETE', '/network/odcs/:id', NM, ({ db, params, query, user }) => {
  const odc = db.odcs.find((d) => d.id === Number(params.id)) || fail(404, 'ODC tidak ditemukan');
  const n = db.odps.filter((p) => p.odc_id === odc.id).length;
  if (n && query.force !== '1') fail(400, `ODC masih memiliki ${n} ODP. Pindahkan ODP terlebih dahulu.`);
  for (const p of db.odps) if (p.odc_id === odc.id) p.odc_id = null;
  db.odcs = db.odcs.filter((d) => d !== odc);
  logActivity(db, user.username, 'hapus_odc', `${odc.code} ${odc.name}`, user.id);
  return { ok: true };
});
const odpRow = (db, p) => { const d = db.odcs.find((x) => x.id === p.odc_id); return { ...p, odc_code: d?.code ?? null, odc_name: d?.name ?? null, created_by_name: userName(db, p.created_by),
  customer_count: db.customers.filter((c) => c.odp_id === p.id && c.status !== 'deleted').length }; };
route('GET', '/network/odps', NV, ({ db, query }) => sortBy(db.odps.filter((p) => !query.odc_id || eq(p.odc_id, query.odc_id)).map((p) => odpRow(db, p)), (p) => p.code));
const odpBody = (db, b) => {
  if (!b.odc_id) fail(400, 'Pilih ODC induk');
  if (!db.odcs.some((d) => d.id === Number(b.odc_id))) fail(400, 'ODC induk tidak ditemukan');
  const [lat, lng] = coords(b);
  return { odc_id: Number(b.odc_id), name: b.name, latitude: lat, longitude: lng, address: b.address || null, capacity: Number(b.capacity) || 8, odc_port: b.odc_port || null, notes: b.notes || null };
};
route('POST', '/network/odps', NM, ({ db, body: b, user }) => {
  if (!b.name) fail(400, 'Nama ODP wajib diisi');
  const data = odpBody(db, b); const code = (b.code || '').trim() || autoCode(db.odps, 'ODP'); uniqueCode(db.odps, code);
  const x = insert(db, 'odps', { code, ...data, created_by: user.id, created_at: now(), updated_at: now() });
  logActivity(db, user.username, 'tambah_odp', `${code} ${b.name}`, user.id);
  return { id: x.id, code };
});
route('PUT', '/network/odps/:id', NM, ({ db, body: b, params, user }) => {
  if (!b.name || !b.code || !b.odc_id) fail(400, 'Kode, nama & ODC induk wajib diisi');
  const data = odpBody(db, b); uniqueCode(db.odps, b.code, params.id);
  Object.assign(db.odps.find((p) => p.id === Number(params.id)) || fail(404, 'ODP tidak ditemukan'), { code: b.code, ...data, updated_at: now() });
  logActivity(db, user.username, 'ubah_odp', b.code, user.id);
  return { ok: true };
});
route('DELETE', '/network/odps/:id', NM, ({ db, params, user }) => {
  const odp = db.odps.find((p) => p.id === Number(params.id)) || fail(404, 'ODP tidak ditemukan');
  for (const c of db.customers) if (c.odp_id === odp.id) c.odp_id = null;
  db.odps = db.odps.filter((p) => p !== odp);
  logActivity(db, user.username, 'hapus_odp', `${odp.code} ${odp.name}`, user.id);
  return { ok: true };
});
const mapConfig = (db) => { const s = getAllSettings(db); return { lat: Number(s.map_center_lat) || -2.6786, lng: Number(s.map_center_lng) || 118.8933, zoom: Number(s.map_zoom) || 13 }; };
route('GET', '/network/config', NV, ({ db }) => mapConfig(db));
route('GET', '/network/map', NV, ({ db }) => ({
  odcs: db.odcs.map(({ id, code, name, latitude, longitude, address, capacity, pon_port }) => ({ id, code, name, latitude, longitude, address, capacity, pon_port, odp_count: db.odps.filter((p) => p.odc_id === id).length })),
  odps: db.odps.map((p) => { const r = odpRow(db, p); return { id: r.id, odc_id: r.odc_id, code: r.code, name: r.name, latitude: r.latitude, longitude: r.longitude, address: r.address, capacity: r.capacity, odc_port: r.odc_port, customer_count: r.customer_count }; }),
  customers: db.customers.filter((c) => c.latitude != null && c.longitude != null && c.status !== 'deleted').map(({ id, code, name, status, latitude, longitude, odp_id }) => ({ id, code, name, status, latitude, longitude, odp_id })),
  config: mapConfig(db),
}));

/* ======================= OLT ZTE ======================= */
const oltDev = (db, id) => { const d = db.devices.find((x) => x.id === Number(id) && x.type === 'olt_zte'); return d || fail(404, 'OLT tidak ditemukan'); };
const validPon = (p) => (/^\d+\/\d+\/\d+$/.test(p || '') ? p : fail(400, 'Format PON harus rack/shelf/slot, contoh 1/1/1'));
route('GET', '/olt/:id/uncfg', ['customers.manage'], ({ db, params }) => wrap(() => zte.unconfigured(db, oltDev(db, params.id))));

/* ======================= Tagihan & pembayaran ======================= */
const INV = ['invoices.manage'];
route('GET', '/invoices', INV, ({ db, query: q }) => {
  const rows = db.invoices.filter((i) => (!q.status || i.status === q.status) && (!q.period || i.period === q.period) && (q.overdue !== '1' || (i.status === 'unpaid' && i.due_date < today())))
    .map((i) => { const c = db.customers.find((x) => x.id === i.customer_id); return { ...i, code: c?.code, name: c?.name, phone: c?.phone, pppoe_username: c?.pppoe_username, customer_status: c?.status }; })
    .filter((i) => like(q.q, i.name, i.code, i.invoice_no, i.pppoe_username));
  return rows.sort((a, b) => b.due_date.localeCompare(a.due_date) || b.id - a.id).slice(0, 2000);
});
route('GET', '/invoices/:id', INV, ({ db, params }) => {
  const i = db.invoices.find((x) => x.id === Number(params.id)) || fail(404, 'Tagihan tidak ditemukan');
  const c = getCustomer(db, i.customer_id);
  return { ...i, code: c.code, name: c.name, phone: c.phone, address: c.address, pppoe_username: c.pppoe_username, package_name: c.package_name,
    payments: db.payments.filter((p) => p.invoice_id === i.id).sort((a, b) => b.id - a.id).map((p) => ({ ...p, admin_name: userName(db, p.admin_id) })), pay_link: payLink(i.invoice_no) };
});
route('POST', '/invoices', INV, ({ db, body }) => {
  const c = getCustomer(db, body.customer_id) || fail(404, 'Pelanggan tidak ditemukan');
  const out = wrap(() => createInvoice(db, c, body.period || thisPeriod(), { notifyWa: !!body.notify }));
  if (!out.created) fail(400, 'Tagihan periode tersebut sudah ada');
  return out.invoice;
});
route('POST', '/invoices/generate', INV, ({ db, body, user }) => {
  const period = body.period || thisPeriod(); let created = 0; const errors = [];
  for (const raw of db.customers.filter((c) => ['active', 'isolated'].includes(c.status) && c.package_id)) {
    const c = getCustomer(db, raw.id);
    try { if (createInvoice(db, c, period, { notifyWa: !!body.notify }).created) created++; } catch (e) { errors.push(`${c.code}: ${e.message}`); }
  }
  logActivity(db, user.username, 'generate_tagihan', `${period}: ${created} tagihan`, user.id);
  return { created, errors };
});
route('POST', '/invoices/:id/pay', INV, ({ db, params, body, user }) => {
  const out = markInvoicePaid(db, params.id, { method: 'manual', channel: body.channel || 'tunai', adminId: user.id, note: body.note || null, actor: user.username });
  if (out.already) fail(400, 'Tagihan sudah lunas');
  return out;
});
route('POST', '/invoices/:id/online', INV, ({ db, params }) => createOnlinePayment(db, params.id));
route('POST', '/invoices/:id/remind', INV, ({ db, params }) => {
  const inv = db.invoices.find((i) => i.id === Number(params.id)) || fail(404, 'Tagihan tidak ditemukan');
  const out = notify(db, getCustomer(db, inv.customer_id), 'wa_tpl_reminder', inv, {}, 'reminder');
  if (!out.ok) fail(502, out.error);
  inv.reminder_sent_at = now();
  return out;
});
route('POST', '/invoices/:id/cancel', INV, ({ db, params, user }) => {
  const inv = db.invoices.find((i) => i.id === Number(params.id));
  if (inv?.status === 'unpaid') inv.status = 'cancelled';
  logActivity(db, user.username, 'batal_tagihan', params.id, user.id);
  return { ok: true };
});
route('PUT', '/invoices/:id', INV, ({ db, params, body }) => {
  const inv = db.invoices.find((i) => i.id === Number(params.id));
  if (inv?.status === 'unpaid') Object.assign(inv, { amount: Number(body.amount), due_date: body.due_date });
  return { ok: true };
});
route('DELETE', '/invoices/:id', INV, ({ db, params }) => {
  const inv = db.invoices.find((i) => i.id === Number(params.id));
  if (inv?.status === 'paid') fail(400, 'Tagihan lunas tidak bisa dihapus');
  db.invoices = db.invoices.filter((i) => i !== inv);
  return { ok: true };
});
route('GET', '/payments', ['payments.view'], ({ db, query: q }) => {
  const rows = db.payments.filter((p) => (!q.status || p.status === q.status) && (!q.method || p.method === q.method)
    && (!q.from || (p.paid_at || p.created_at).slice(0, 10) >= q.from) && (!q.to || (p.paid_at || p.created_at).slice(0, 10) <= q.to))
    .map((p) => { const i = db.invoices.find((x) => x.id === p.invoice_id); const c = db.customers.find((x) => x.id === p.customer_id);
      return { id: p.id, invoice_id: p.invoice_id, customer_id: p.customer_id, amount: p.amount, method: p.method, channel: p.channel, order_id: p.order_id, status: p.status,
        paid_at: p.paid_at, note: p.note, created_at: p.created_at, invoice_no: i?.invoice_no, period: i?.period, code: c?.code, name: c?.name, admin_name: userName(db, p.admin_id) }; })
    .filter((p) => like(q.q, p.name, p.code, p.invoice_no, p.order_id));
  return rows.sort((a, b) => b.id - a.id).slice(0, 2000);
});

/* ======================= Laporan ======================= */
const ok = (p) => p.status === 'success';
route('GET', '/reports/dashboard', ['dashboard.view'], ({ db }) => {
  const period = thisPeriod(); const t = today();
  const counts = {};
  for (const c of db.customers) if (c.status !== 'deleted') counts[c.status] = (counts[c.status] || 0) + 1;
  const agg = (rows) => ({ total: rows.reduce((s, x) => s + x.amount, 0), n: rows.length });
  const paid = db.payments.filter((p) => ok(p) && p.paid_at);
  const unpaid = db.invoices.filter((i) => i.status === 'unpaid');
  const cust = (id) => db.customers.find((c) => c.id === id) || {};
  const start = addMonths(period, -11);
  const chartMap = {};
  for (const p of paid) { const ym = p.paid_at.slice(0, 7); if (ym >= start) chartMap[ym] = (chartMap[ym] || 0) + p.amount; }
  return {
    counts, income: agg(paid.filter((p) => p.paid_at.startsWith(period))), today: agg(paid.filter((p) => p.paid_at.startsWith(t))),
    unpaid: agg(unpaid), overdue: agg(unpaid.filter((i) => i.due_date < t)),
    dueSoon: unpaid.filter((i) => i.due_date >= t && i.due_date <= addDays(t, 5)).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 10)
      .map((i) => ({ id: i.id, invoice_no: i.invoice_no, amount: i.amount, due_date: i.due_date, name: cust(i.customer_id).name, code: cust(i.customer_id).code })),
    recent: [...paid].sort((a, b) => b.paid_at.localeCompare(a.paid_at)).slice(0, 10).map((p) => ({ id: p.id, amount: p.amount, method: p.method, channel: p.channel, paid_at: p.paid_at,
      name: cust(p.customer_id).name, invoice_no: db.invoices.find((i) => i.id === p.invoice_id)?.invoice_no })),
    devices: sortBy(db.devices.map(({ id, name, type, vendor, last_status, last_checked_at }) => ({ id, name, type, vendor, last_status, last_checked_at })), (d) => d.type + d.name),
    chart: Object.entries(chartMap).sort().map(([ym, total]) => ({ ym, total })),
  };
});
route('GET', '/reports/monthly', ['reports.view'], ({ db, query }) => {
  const year = Number(query.year) || new Date().getFullYear(); const month = Number(query.month) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const pays = db.payments.filter((p) => ok(p) && p.paid_at?.startsWith(period)).sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map((p) => {
    const i = db.invoices.find((x) => x.id === p.invoice_id); const c = db.customers.find((x) => x.id === p.customer_id);
    return { id: p.id, amount: p.amount, method: p.method, channel: p.channel, paid_at: p.paid_at, note: p.note, invoice_no: i?.invoice_no, period: i?.period, code: c?.code, name: c?.name, admin_name: userName(db, p.admin_id) };
  });
  const days = new Date(year, month, 0).getDate();
  const daily = Array.from({ length: days }, (_, k) => { const r = pays.filter((p) => Number(p.paid_at.slice(8, 10)) === k + 1); return { day: k + 1, total: r.reduce((s, p) => s + p.amount, 0), count: r.length }; });
  const bm = {};
  for (const p of pays) { const k = `${p.method}|${p.channel || '-'}`; bm[k] = bm[k] || { method: p.method, channel: p.channel || '-', total: 0, n: 0 }; bm[k].total += p.amount; bm[k].n++; }
  const inv = db.invoices.filter((i) => i.period === period && i.status !== 'cancelled');
  const sum = (r) => r.reduce((s, i) => s + i.amount, 0);
  const paidI = inv.filter((i) => i.status === 'paid'); const unpaidI = inv.filter((i) => i.status === 'unpaid');
  return { period, total: pays.reduce((s, p) => s + p.amount, 0), count: pays.length, daily, byMethod: Object.values(bm).sort((a, b) => b.total - a.total),
    billing: { total_invoice: inv.length, total_amount: sum(inv), paid_count: paidI.length, paid_amount: sum(paidI), unpaid_count: unpaidI.length, unpaid_amount: sum(unpaidI) },
    payments: pays,
    unpaidList: unpaidI.map((i) => { const c = db.customers.find((x) => x.id === i.customer_id); return { invoice_no: i.invoice_no, amount: i.amount, due_date: i.due_date, code: c?.code, name: c?.name, status: c?.status }; })
      .sort((a, b) => String(a.name).localeCompare(String(b.name))) };
});
route('GET', '/reports/yearly', ['reports.view'], ({ db, query }) => {
  const year = Number(query.year) || new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, k) => {
    const ym = `${year}-${String(k + 1).padStart(2, '0')}`;
    const pays = db.payments.filter((p) => ok(p) && p.paid_at?.startsWith(ym));
    const inv = db.invoices.filter((i) => i.period === ym && i.status !== 'cancelled');
    const s = (r, f = () => true) => r.filter(f).reduce((a, x) => a + x.amount, 0);
    return { month: k + 1, income: s(pays), count: pays.length, manual: s(pays, (p) => p.method === 'manual'), online: s(pays, (p) => p.method === 'midtrans'),
      billed: s(inv), billed_paid: s(inv, (i) => i.status === 'paid'), billed_unpaid: s(inv, (i) => i.status === 'unpaid'),
      new_customers: db.customers.filter((c) => c.created_at?.startsWith(ym)).length };
  });
  return { year, total: months.reduce((a, b) => a + b.income, 0), months };
});
route('GET', '/reports/activity', ['logs.own'], ({ db, query: q, user }) => {
  const all = false; // versi tanpa admin: setiap user hanya melihat log miliknya
  const rows = db.activity_logs.filter((l) => {
    if (all) {
      if (q.user_id === 'system') { if (!(l.user_id == null && ['system', 'auto', 'midtrans'].includes(l.actor))) return false; }
      else if (q.user_id) { const u = db.users.find((x) => x.id === Number(q.user_id)); if (!(l.user_id === Number(q.user_id) || (u && l.actor === u.username))) return false; }
    } else if (!(l.user_id === user.id || l.actor === user.username)) return false;
    return (!q.action || l.action === q.action) && (!q.from || l.created_at.slice(0, 10) >= q.from) && (!q.to || l.created_at.slice(0, 10) <= q.to) && like(q.q, l.detail, l.actor);
  }).sort((a, b) => b.id - a.id).slice(0, 1000).map((l) => { const u = db.users.find((x) => x.id === l.user_id); return { ...l, user_name: u?.name ?? null, user_role: u?.role ?? null }; });
  return { rows, actions: [...new Set(db.activity_logs.map((l) => l.action))].sort(), scope: all ? 'all' : 'own' };
});

/* ======================= WhatsApp ======================= */
const WA = ['whatsapp.manage'];
route('GET', '/whatsapp/status', WA, ({ db }) => waStatus(db));
route('POST', '/whatsapp/test', WA, ({ db, body }) => sendWhatsapp(db, body.phone, body.message || 'Tes pesan dari NetBill ✅', { type: 'test', throwOnError: true }));
route('POST', '/whatsapp/broadcast', WA, ({ db, body }) => {
  if (!body.message) fail(400, 'Pesan kosong');
  let sent = 0; let failed = 0;
  for (const raw of db.customers.filter((c) => c.phone && (body.status ? c.status === body.status : c.status !== 'deleted'))) {
    const c = getCustomer(db, raw.id);
    const out = sendWhatsapp(db, c.phone, fillTemplate(body.message, templateData(db, c)), { customerId: c.id, type: 'broadcast' });
    if (out.ok) sent++; else failed++;
  }
  return { sent, failed };
});
route('GET', '/whatsapp/logs', WA, ({ db }) => [...db.wa_logs].sort((a, b) => b.id - a.id).slice(0, 500).map((w) => { const c = db.customers.find((x) => x.id === w.customer_id); return { ...w, name: c?.name ?? null, code: c?.code ?? null }; }));

/* ======================= Pengaturan & job ======================= */
route('GET', '/settings', ['settings.manage', 'whatsapp.manage'], ({ db, can }) => {
  const s = getAllSettings(db);
  // Operator hanya boleh tahu provider & nama perusahaan; pengaturan lain dikelola admin
  return can('settings.manage') ? maskSecrets(s) : { wa_provider: s.wa_provider, company_name: s.company_name };
});
route('PUT', '/settings', ['settings.manage'], ({ db, body, user }) => {
  const b = { ...body };
  for (const k of Object.keys(b)) if (typeof b[k] === 'string' && b[k].includes('••••')) delete b[k];
  const s = setSettings(db, b);
  logActivity(db, user.username, 'ubah_pengaturan', Object.keys(b).join(','), user.id);
  return maskSecrets(s);
});
route('POST', '/settings/reset-template/:key', ['settings.manage'], ({ db, params }) => {
  if (!(params.key in DEFAULT_SETTINGS)) fail(400, 'Key tidak dikenal');
  setSettings(db, { [params.key]: DEFAULT_SETTINGS[params.key] });
  return { value: DEFAULT_SETTINGS[params.key] };
});
const JOBS = {
  invoice: generateInvoices, isolir: runAutoIsolir, reminder: runReminders, 'auto-delete': runAutoDelete,
  midtrans: (db) => ({ paid: 0, pending: db.payments.filter((p) => p.method === 'midtrans' && p.status === 'pending').length }),
  devices: (db) => { const result = db.devices.map((d) => ({ id: d.id, status: d.type === 'olt_other' ? 'offline' : 'online' })); for (const r of result) Object.assign(db.devices.find((d) => d.id === r.id), { last_status: r.status, last_checked_at: now() }); emit('devices:status', result); return {}; },
};
route('POST', '/settings/run-job/:name', ['settings.manage'], ({ db, params }) => {
  const fn = JOBS[params.name] || fail(404, 'Job tidak dikenal');
  const result = fn(db);
  emit('job:log', { name: params.name, result, at: now().slice(11) });
  return result;
});

/** Pembayaran dari halaman simulasi Midtrans (public/midtrans-demo.html) */
/** Job terjadwal "server": dijalankan otomatis sekali sehari saat demo dibuka (pengganti cron backend) */
export function runDailyJobs(db) {
  const t = today();
  if (db.sim.jobs_ran === t) return;
  db.sim.jobs_ran = t;
  for (const [name, fn] of [['invoice', generateInvoices], ['reminder', runReminders], ['isolir', runAutoIsolir], ['auto-delete', runAutoDelete]]) {
    try { const result = fn(db); logActivity(db, 'system', `job_${name}`, JSON.stringify(result)); } catch { /* lewati */ }
  }
}

export function settleDemoPayment(db, orderId, channel = 'qris') {
  const p = db.payments.find((x) => x.order_id === orderId && x.status === 'pending');
  if (!p) return null;
  return markInvoicePaid(db, p.invoice_id, { method: 'midtrans', channel, orderId, actor: 'midtrans' });
}
