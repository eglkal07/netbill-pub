// Logika bisnis (port dari backend/src/services/billing.js, provision.js, payment.js) di atas data demo.
import { fail, now, today, thisPeriod, addDays, addMonths, dueDateFor, daysBetween, rupiah, periodLabel, dateLabel, fillTemplate,
  normalizePhone, randomString, insert, logActivity, emit, num, parse } from './core.js';
import { getAllSettings } from './settings.js';
import { mk, zte, sendWhatsapp } from './sim.js';

/* ======================= Helper data ======================= */
export const getDevice = (db, id) => (id ? db.devices.find((d) => d.id === Number(id)) || null : null);
export function getCustomer(db, id) {
  const c = db.customers.find((x) => x.id === Number(id));
  if (!c) return null;
  const p = db.packages.find((x) => x.id === c.package_id); const r = getDevice(db, c.router_id); const o = getDevice(db, c.olt_id);
  const od = db.odps.find((x) => x.id === c.odp_id);
  return { ...c, package_name: p?.name ?? null, package_price: p?.price ?? null, mikrotik_profile: p?.mikrotik_profile ?? null, router_name: r?.name ?? null,
    olt_name: o?.name ?? null, olt_type: o?.type ?? null, odp_code: od?.code ?? null, odp_name: od?.name ?? null };
}
const raw = (db, id) => db.customers.find((x) => x.id === Number(id));
export const payLink = (invoiceNo) => `${typeof window !== "undefined" ? window.location.origin : ""}/midtrans-demo.html?invoice=${encodeURIComponent(invoiceNo)}`;

export function templateData(db, c, invoice = null, extra = {}) {
  const s = getAllSettings(db);
  const d = { perusahaan: s.company_name, nama: c.name, kode: c.code, username: c.pppoe_username, password: c.pppoe_password, paket: c.package_name || '-',
    harga: rupiah(c.package_price), tgl_tempo: c.billing_day, app_password: extra.app_password || '(tidak berubah)', ...extra };
  if (invoice) Object.assign(d, { no_tagihan: invoice.invoice_no, periode: periodLabel(invoice.period), tagihan: rupiah(invoice.amount), jatuh_tempo: dateLabel(invoice.due_date),
    sisa_hari: Math.max(0, daysBetween(today(), invoice.due_date)), link_bayar: payLink(invoice.invoice_no) });
  return d;
}
export function notify(db, c, tplKey, invoice, extra = {}, type = tplKey) {
  const s = getAllSettings(db);
  return sendWhatsapp(db, c.phone, fillTemplate(s[tplKey], templateData(db, c, invoice, extra)), { customerId: c.id, type });
}

/* ======================= Aksi PPPoE ======================= */
export function isolateCustomer(db, id, { actor = 'system', silent = false, invoice = null } = {}) {
  const c = getCustomer(db, id);
  if (!c) fail(404, 'Pelanggan tidak ditemukan');
  if (c.status === 'deleted') fail(400, 'Pelanggan sudah dihapus');
  const s = getAllSettings(db);
  mk.setProfile(db, getDevice(db, c.router_id), c.pppoe_username, s.isolir_profile);
  const r = raw(db, id); r.status = 'isolated'; r.isolated_at = r.isolated_at || now();
  logActivity(db, actor, 'isolir', `${c.code} ${c.pppoe_username}`);
  if (!silent && s.wa_send_isolir === '1') {
    const inv = invoice || db.invoices.filter((i) => i.customer_id === c.id && i.status === 'unpaid').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    if (inv) notify(db, c, 'wa_tpl_isolir', inv, {}, 'isolir');
  }
  emit('customer:updated', { id: c.id, status: 'isolated' });
  return { ok: true };
}
export function activateCustomer(db, id, { actor = 'system' } = {}) {
  const c = getCustomer(db, id);
  if (!c) fail(404, 'Pelanggan tidak ditemukan');
  if (c.status === 'deleted') fail(400, 'PPPoE pelanggan sudah dihapus. Buat ulang PPPoE dari menu edit pelanggan.');
  if (!c.mikrotik_profile) fail(400, 'Paket pelanggan belum memiliki profile MikroTik');
  mk.setProfile(db, getDevice(db, c.router_id), c.pppoe_username, c.mikrotik_profile);
  const r = raw(db, id); r.status = 'active'; r.isolated_at = null;
  logActivity(db, actor, 'aktifkan', `${c.code} ${c.pppoe_username}`);
  emit('customer:updated', { id: c.id, status: 'active' });
  return { ok: true };
}
export function deletePppoe(db, id, { actor = 'system', removeOnu = true } = {}) {
  const c = getCustomer(db, id);
  if (!c) fail(404, 'Pelanggan tidak ditemukan');
  const errors = [];
  const router = getDevice(db, c.router_id);
  if (router) { try { mk.removeSecret(db, router, c.pppoe_username); } catch (e) { errors.push(e.message); } }
  if (removeOnu && c.olt_id && c.onu_pon && c.onu_id) {
    const olt = getDevice(db, c.olt_id);
    if (zte.isZte(olt)) { try { zte.remove(db, olt, c.onu_pon, c.onu_id); } catch (e) { errors.push(e.message); } }
  }
  const r = raw(db, id); r.status = 'deleted'; r.deleted_at = now();
  for (const i of db.invoices) if (i.customer_id === c.id && i.status === 'unpaid') i.status = 'cancelled';
  logActivity(db, actor, 'hapus_pppoe', `${c.code} ${c.pppoe_username} ${errors.join('; ')}`);
  emit('customer:updated', { id: c.id, status: 'deleted' });
  return { ok: true, errors };
}

/* ======================= Tagihan ======================= */
export function createInvoice(db, c, period, { notifyWa = true } = {}) {
  const exist = db.invoices.find((i) => i.customer_id === c.id && i.period === period);
  if (exist) return { invoice: exist, created: false };
  const amount = Number(c.package_price || 0);
  if (amount <= 0) throw new Error(`Paket pelanggan ${c.code} belum memiliki harga`);
  const invoice = insert(db, 'invoices', { invoice_no: `INV${period.replace('-', '')}${String(c.id).padStart(5, '0')}`, customer_id: c.id, period, amount,
    due_date: dueDateFor(period, c.billing_day), status: 'unpaid', paid_at: null, reminder_sent_at: null, notified_at: null, created_at: now() });
  if (notifyWa && getAllSettings(db).wa_send_invoice === '1') { notify(db, c, 'wa_tpl_invoice', invoice, {}, 'invoice'); invoice.notified_at = now(); }
  return { invoice, created: true };
}
export function generateInvoices(db) {
  const s = getAllSettings(db); const daysBefore = Number(s.invoice_days_before || 10);
  let created = 0;
  for (const raw0 of db.customers.filter((c) => ['active', 'isolated'].includes(c.status) && c.package_id)) {
    const c = getCustomer(db, raw0.id);
    for (const off of [0, 1]) {
      const period = addMonths(thisPeriod(), off);
      const due = dueDateFor(period, c.billing_day);
      if (due < c.created_at.slice(0, 10)) continue;
      if (today() < addDays(due, -daysBefore)) continue;
      try { if (createInvoice(db, c, period).created) created++; } catch { /* lewati */ }
    }
  }
  return { created };
}

export function markInvoicePaid(db, invoiceId, { method = 'manual', channel = null, adminId = null, orderId = null, note = null, actor = 'system' } = {}) {
  const inv = db.invoices.find((i) => i.id === Number(invoiceId));
  if (!inv) fail(404, 'Tagihan tidak ditemukan');
  if (inv.status === 'paid') return { already: true, invoice: inv };
  if (inv.status === 'cancelled') fail(400, 'Tagihan sudah dibatalkan');
  inv.status = 'paid'; inv.paid_at = now();
  const po = orderId && db.payments.find((p) => p.order_id === orderId);
  if (po) Object.assign(po, { status: 'success', paid_at: now(), channel: channel || po.channel });
  else insert(db, 'payments', { invoice_id: inv.id, customer_id: inv.customer_id, amount: inv.amount, method, channel, order_id: null, snap_token: null, redirect_url: null,
    status: 'success', paid_at: now(), admin_id: adminId, note, raw_response: null, created_at: now() });
  for (const p of db.payments) if (p.invoice_id === inv.id && p.status === 'pending') p.status = 'expired';

  const c = getCustomer(db, inv.customer_id);
  logActivity(db, actor, 'bayar', `${inv.invoice_no} ${rupiah(inv.amount)} via ${method}${channel ? ' (' + channel + ')' : ''}`, adminId);
  let activated = false; let activationError = null;
  const s = getAllSettings(db);
  if (c && c.status === 'isolated') {
    const grace = Number(s.grace_days || 0);
    const overdue = db.invoices.filter((i) => i.customer_id === c.id && i.status === 'unpaid' && addDays(i.due_date, grace) < today()).length;
    if (!overdue) { try { activateCustomer(db, c.id, { actor }); activated = true; } catch (e) { activationError = e.message; } }
  }
  if (c && s.wa_send_paid === '1') notify(db, c, 'wa_tpl_paid', inv, { metode: method === 'manual' ? 'Bayar di admin' : `Online (${channel || 'Midtrans'})` }, 'paid');
  emit('payment:paid', { invoice_id: inv.id, invoice_no: inv.invoice_no, customer_id: inv.customer_id, customer_name: c?.name, amount: inv.amount, method, activated });
  return { invoice: inv, activated, activationError };
}

/** Link pembayaran Midtrans (simulasi). Halaman /midtrans-demo.html menjelaskan bahwa ini demo. */
export function createOnlinePayment(db, invoiceId) {
  const inv = db.invoices.find((i) => i.id === Number(invoiceId));
  if (!inv) fail(404, 'Tagihan tidak ditemukan');
  if (inv.status !== 'unpaid') fail(400, 'Tagihan sudah ' + (inv.status === 'paid' ? 'lunas' : 'dibatalkan'));
  const ex = db.payments.find((p) => p.invoice_id === inv.id && p.method === 'midtrans' && p.status === 'pending');
  if (ex) return { order_id: ex.order_id, token: ex.snap_token, redirect_url: ex.redirect_url, amount: inv.amount, invoice: inv };
  const orderId = `${inv.invoice_no}-${Date.now().toString(36).toUpperCase()}`;
  const url = `${payLink(inv.invoice_no)}&order=${encodeURIComponent(orderId)}&amount=${inv.amount}`;
  insert(db, 'payments', { invoice_id: inv.id, customer_id: inv.customer_id, amount: inv.amount, method: 'midtrans', channel: null, order_id: orderId,
    snap_token: 'DEMO-' + randomString(10), redirect_url: url, status: 'pending', paid_at: null, admin_id: null, note: null, raw_response: null, created_at: now() });
  return { order_id: orderId, token: null, redirect_url: url, amount: inv.amount, invoice: inv, simulated: true };
}

/* ======================= Job otomatis ======================= */
export function runAutoIsolir(db) {
  const s = getAllSettings(db);
  if (s.auto_isolir_enabled !== '1') return { skipped: true };
  const grace = Number(s.grace_days || 0);
  const result = { isolated: 0, failed: [] }; const seen = new Set();
  const rows = db.invoices.filter((i) => i.status === 'unpaid' && raw(db, i.customer_id)?.status === 'active' && addDays(i.due_date, grace) < today())
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  for (const inv of rows) {
    if (seen.has(inv.customer_id)) continue;
    seen.add(inv.customer_id);
    try { isolateCustomer(db, inv.customer_id, { actor: 'auto', invoice: inv }); result.isolated++; } catch (e) { result.failed.push(`${inv.customer_id}: ${e.message}`); }
  }
  return result;
}
export function runReminders(db) {
  const days = Number(getAllSettings(db).reminder_days_before || 5);
  const rows = db.invoices.filter((i) => i.status === 'unpaid' && !i.reminder_sent_at && ['active', 'isolated'].includes(raw(db, i.customer_id)?.status)
    && i.due_date <= addDays(today(), days) && i.due_date >= today());
  let sent = 0;
  for (const inv of rows) { const r = notify(db, getCustomer(db, inv.customer_id), 'wa_tpl_reminder', inv, {}, 'reminder'); if (r.ok) { sent++; inv.reminder_sent_at = now(); } }
  return { sent, total: rows.length };
}
export function runAutoDelete(db) {
  const s = getAllSettings(db);
  if (s.auto_delete_enabled !== '1') return { skipped: true };
  const limit = addDays(today(), -Number(s.auto_delete_days || 90));
  let deleted = 0;
  for (const c of db.customers.filter((x) => x.status === 'isolated' && x.isolated_at && x.isolated_at.slice(0, 10) <= limit)) {
    try { deletePppoe(db, c.id, { actor: 'auto', removeOnu: s.auto_delete_onu === '1' }); deleted++; } catch { /* lewati */ }
  }
  return { deleted };
}

/* ======================= Provisioning pelanggan ======================= */
export function nextCode(db) {
  const n = db.customers.reduce((m, c) => (/^PLG\d+$/.test(c.code) ? Math.max(m, Number(c.code.slice(3))) : m), 0);
  return 'PLG' + String(n + 1).padStart(5, '0');
}
export function billingDayFrom(b) {
  if (b.billing_day) return Math.min(28, Math.max(1, Number(b.billing_day)));
  if (b.install_date) return Math.min(28, parse(b.install_date + ' 00:00:00').getDate());
  return Math.min(28, new Date().getDate());
}
export function sendAccount(db, id, { resetPassword = true, actor = 'admin' } = {}) {
  const c = getCustomer(db, id);
  let appPassword = '(gunakan password lama)';
  if (resetPassword || !c.app_password) { appPassword = randomString(6); raw(db, id).app_password = appPassword; }
  const msg = fillTemplate(getAllSettings(db).wa_tpl_account, templateData(db, getCustomer(db, id), null, { app_password: appPassword }));
  const result = sendWhatsapp(db, c.phone, msg, { customerId: c.id, type: 'account' });
  logActivity(db, actor, 'kirim_akun_wa', `${c.code} ${result.ok ? 'terkirim' : 'gagal: ' + result.error}`);
  return { ...result, app_password: resetPassword || !c.app_password ? appPassword : undefined };
}

export function provisionCustomer(db, b, { existingId = null, user }) {
  if (!b.name || !b.pppoe_username || !b.pppoe_password || !b.package_id || !b.router_id) fail(400, 'Nama, paket, router, username & password PPPoE wajib diisi');
  if (db.customers.some((c) => c.pppoe_username === b.pppoe_username && c.id !== Number(existingId || 0))) fail(400, 'Username PPPoE sudah dipakai');
  const pkg = db.packages.find((p) => p.id === Number(b.package_id));
  if (!pkg) fail(400, 'Paket tidak ditemukan');
  const router = getDevice(db, b.router_id);
  let existing = null;
  if (existingId) {
    existing = raw(db, existingId);
    if (!existing) fail(404, 'Pendaftaran tidak ditemukan');
    if (existing.status !== 'pending') fail(400, 'Pelanggan ini sudah diaktivasi');
  }
  const code = existing?.code || b.code || nextCode(db);
  if (!b.skip_mikrotik) {
    try {
      mk.upsertSecret(db, router, { name: b.pppoe_username, password: b.pppoe_password, profile: pkg.mikrotik_profile,
        remoteAddress: b.remote_address, localAddress: b.local_address, comment: `${code} | ${b.name}` });
    } catch (e) { fail(502, e.message); }
  }
  const vals = { name: b.name, phone: normalizePhone(b.phone) || null, email: b.email || null, address: b.address || null, router_id: Number(b.router_id),
    package_id: Number(b.package_id), pppoe_username: b.pppoe_username, pppoe_password: b.pppoe_password, remote_address: b.remote_address || null,
    local_address: b.local_address || null, olt_id: num(b.olt_id), onu_pon: b.onu_pon || null, onu_id: num(b.onu_id), onu_sn: b.onu_sn || null,
    onu_type: b.onu_type || null, onu_vlan: num(b.onu_vlan), billing_day: billingDayFrom(b), notes: b.notes || null, install_date: b.install_date || null,
    latitude: num(b.latitude), longitude: num(b.longitude), odp_id: num(b.odp_id), updated_at: now() };
  let id = existingId ? Number(existingId) : null;
  if (existing) Object.assign(existing, vals, { status: 'active', activated_at: now() });
  else id = insert(db, 'customers', { code, ...vals, status: 'active', created_by: user.id, activated_at: now(), isolated_at: null, deleted_at: null, app_password: null, created_at: now() }).id;
  const result = { id, code, warnings: [] };

  const olt = b.olt_id ? getDevice(db, b.olt_id) : null;
  if (olt && b.register_onu && !zte.isZte(olt)) result.warnings.push(`${olt.name} bukan OLT ZTE – langkah konfigurasi OLT dilewati`);
  if (olt && zte.isZte(olt) && b.register_onu && b.onu_sn && b.onu_pon) {
    try {
      const reg = zte.register(db, olt, getAllSettings(db), { pon: b.onu_pon, onu: b.onu_id || null, sn: b.onu_sn, type: b.onu_type || undefined, username: b.pppoe_username, password: b.pppoe_password });
      raw(db, id).onu_id = reg.onu; result.onu = reg.onu;
    } catch (e) { result.warnings.push('Registrasi ONU gagal: ' + e.message); }
  }
  if (b.create_first_invoice) {
    try { createInvoice(db, getCustomer(db, id), thisPeriod(), { notifyWa: false }); } catch (e) { result.warnings.push('Tagihan pertama: ' + e.message); }
  }
  const s = getAllSettings(db);
  if (b.send_wa ?? s.wa_send_on_create === '1') {
    const wa = sendAccount(db, id, { resetPassword: true, actor: user.username });
    result.wa = wa; if (!wa.ok) result.warnings.push('WhatsApp: ' + wa.error);
  } else {
    const pw = b.app_password || randomString(6); raw(db, id).app_password = pw; result.app_password = pw;
  }
  logActivity(db, user.username, existing ? 'aktivasi_pendaftaran' : 'tambah_pelanggan', `${code} ${b.name} ${b.pppoe_username}`, user.id);
  emit('customer:updated', { id });
  if (existing) emit('registration:updated', { id });
  return result;
}
