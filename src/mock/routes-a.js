// Rute API tiruan bagian 1: auth, daftar perangkat (hanya-baca), paket, pelanggan, pendaftaran.
import { route, fail, now, like, eq, sortBy, insert, logActivity, emit, normalizePhone, randomString, fillTemplate, num } from './core.js';
import { getRoles, permissionsOf, getAllSettings } from './settings.js';
import { mk, zte, sendWhatsapp } from './sim.js';
import { getCustomer, getDevice, isolateCustomer, activateCustomer, deletePppoe, templateData, provisionCustomer, sendAccount, nextCode, billingDayFrom } from './services.js';

/* ======================= Auth & user ======================= */
export const tokenFor = (u) => `demo.${u.id}.${randomString(10)}`;
export const uidFromToken = (t) => { const m = /^demo\.(\d+)\./.exec(t || ''); return m ? Number(m[1]) : null; };

route('POST', '/auth/login', null, ({ db, body }) => {
  const u = db.users.find((x) => x.username === body.username);
  if (!u || u.password !== body.password) fail(401, 'Username atau password salah');
  if (!u.is_active) fail(403, 'Akun dinonaktifkan. Hubungi admin.');
  logActivity(db, u.username, 'login', '127.0.0.1 (demo)', u.id);
  return { token: tokenFor(u), user: { id: u.id, name: u.name, username: u.username, role: u.role, permissions: permissionsOf(db, u.role) } };
});
route('GET', '/auth/me', [], ({ db, user, perms }) => ({ id: user.id, name: user.name, username: user.username, role: user.role,
  role_label: getRoles(db).find((x) => x.name === user.role)?.label || user.role, permissions: perms }));
route('POST', '/auth/change-password', [], ({ db, user, body }) => {
  const u = db.users.find((x) => x.id === user.id);
  if (u.password !== body.old_password) fail(400, 'Password lama salah');
  if (!body.new_password || body.new_password.length < 6) fail(400, 'Password baru minimal 6 karakter');
  u.password = body.new_password; logActivity(db, user.username, 'ganti_password', '', user.id);
  return { ok: true };
});

/* ======================= Perangkat ======================= */
// Perangkat (MikroTik & OLT) sudah dikonfigurasi admin di database. Frontend hanya menerima nama & status untuk dipilih;
// alamat IP, port, dan kredensial tidak pernah dikirim ke peramban, dan tidak ada endpoint untuk mengubah perangkat.
const LIST_PERMS = ['customers.manage', 'packages.manage', 'network.manage', 'dashboard.traffic'];
const hide = (d) => ({ id: d.id, name: d.name, type: d.type, vendor: d.vendor, last_status: d.last_status, last_checked_at: d.last_checked_at });
const loadDev = (db, id) => getDevice(db, id) || fail(404, 'Perangkat tidak ditemukan');
const wrap = (fn) => { try { return fn(); } catch (e) { if (e.status) throw e; return fail(502, e.message); } };

route('GET', '/devices', LIST_PERMS, ({ db, query }) => sortBy(db.devices.filter((d) => !query.type || d.type === query.type), (d) => d.type + d.name).map(hide));
route('GET', '/devices/:id/interfaces', ['dashboard.traffic'], ({ db, params }) => wrap(() => mk.interfaces(db, loadDev(db, params.id))));
route('GET', '/devices/:id/ppp-profiles', ['packages.manage'], ({ db, params }) => wrap(() => mk.pppProfiles(db, loadDev(db, params.id))));

/* ======================= Paket ======================= */
route('GET', '/packages', ['packages.manage', 'customers.manage'], ({ db }) => sortBy(db.packages.map((p) => ({ ...p, router_name: getDevice(db, p.router_id)?.name ?? null,
  customer_count: db.customers.filter((c) => c.package_id === p.id && c.status !== 'deleted').length })), (p) => p.price));
const pkgBody = (b) => {
  if (!b.name || !b.mikrotik_profile) fail(400, 'Nama paket dan profile MikroTik wajib diisi');
  return { name: b.name, price: Number(b.price) || 0, router_id: num(b.router_id), mikrotik_profile: b.mikrotik_profile, rate_limit: b.rate_limit || null, description: b.description || null };
};
route('POST', '/packages', ['packages.manage'], ({ db, body }) => ({ id: insert(db, 'packages', { ...pkgBody(body), created_at: now() }).id }));
route('PUT', '/packages/:id', ['packages.manage'], ({ db, body, params }) => { Object.assign(db.packages.find((p) => p.id === Number(params.id)) || fail(404, 'Paket tidak ditemukan'), pkgBody(body)); return { ok: true }; });
route('DELETE', '/packages/:id', ['packages.manage'], ({ db, params }) => {
  const n = db.customers.filter((c) => c.package_id === Number(params.id) && c.status !== 'deleted').length;
  if (n) fail(400, `Paket masih dipakai ${n} pelanggan`);
  db.packages = db.packages.filter((p) => p.id !== Number(params.id));
  return { ok: true };
});

/* ======================= Pelanggan ======================= */
const C = ['customers.manage'];
route('GET', '/customers', C, ({ db, query: q }) => {
  const rows = db.customers.filter((c) => (q.status ? c.status === q.status : !['deleted', 'pending'].includes(c.status))
    && (!q.router_id || eq(c.router_id, q.router_id)) && (!q.package_id || eq(c.package_id, q.package_id)) && like(q.q, c.name, c.code, c.pppoe_username, c.phone));
  return sortBy(rows, (c) => c.id, true).map((c) => {
    const p = db.packages.find((x) => x.id === c.package_id); const unpaid = db.invoices.filter((i) => i.customer_id === c.id && i.status === 'unpaid');
    return { id: c.id, code: c.code, name: c.name, phone: c.phone, address: c.address, pppoe_username: c.pppoe_username, status: c.status, billing_day: c.billing_day,
      isolated_at: c.isolated_at, created_at: c.created_at, onu_pon: c.onu_pon, onu_id: c.onu_id, onu_sn: c.onu_sn, router_id: c.router_id, olt_id: c.olt_id,
      package_id: c.package_id, latitude: c.latitude, longitude: c.longitude, odp_id: c.odp_id, package_name: p?.name ?? null, package_price: p?.price ?? null,
      router_name: getDevice(db, c.router_id)?.name ?? null, unpaid_count: unpaid.length, unpaid_total: unpaid.reduce((s, i) => s + i.amount, 0) };
  });
});
route('GET', '/customers/:id', C, ({ db, params }) => {
  const c = getCustomer(db, params.id) || fail(404, 'Pelanggan tidak ditemukan');
  const { app_password, ...rest } = c; // eslint-disable-line no-unused-vars
  return { ...rest, invoices: sortBy(db.invoices.filter((i) => i.customer_id === c.id), (i) => i.period, true),
    payments: sortBy(db.payments.filter((p) => p.customer_id === c.id), (p) => p.id, true).slice(0, 50),
    wa_logs: sortBy(db.wa_logs.filter((w) => w.customer_id === c.id), (w) => w.id, true).slice(0, 20).map(({ id, type, status, error, created_at }) => ({ id, type, status, error, created_at })) };
});
route('GET', '/customers/:id/live', C, ({ db, params }) => wrap(() => {
  const c = getCustomer(db, params.id); const r = getDevice(db, c.router_id);
  return { active: mk.pppActive(db, r).find((a) => a.name === c.pppoe_username) || null, secret: mk.getSecret(db, r, c.pppoe_username) };
}));
route('POST', '/customers', C, ({ db, body, user }) => provisionCustomer(db, body, { user }));
route('PUT', '/customers/:id', C, ({ db, body, params, user }) => {
  const c = getCustomer(db, params.id) || fail(404, 'Pelanggan tidak ditemukan');
  if (c.status === 'pending') fail(400, 'Pelanggan masih berstatus pendaftaran. Lengkapi & aktivasi dari menu Pendaftaran.');
  const b = { ...c, ...body };
  const pkg = db.packages.find((p) => p.id === Number(b.package_id)) || fail(400, 'Paket tidak ditemukan');
  if (b.pppoe_username !== c.pppoe_username && db.customers.some((x) => x.pppoe_username === b.pppoe_username && x.id !== c.id)) fail(400, 'Username PPPoE sudah dipakai');
  const warnings = [];
  if (c.status !== 'deleted' && !body.skip_mikrotik) {
    wrap(() => mk.upsertSecret(db, getDevice(db, b.router_id), { oldName: c.pppoe_username, name: b.pppoe_username, password: b.pppoe_password,
      profile: c.status === 'isolated' ? getAllSettings(db).isolir_profile : pkg.mikrotik_profile, remoteAddress: b.remote_address, localAddress: b.local_address, comment: `${c.code} | ${b.name}` }));
  }
  const raw = db.customers.find((x) => x.id === c.id);
  Object.assign(raw, { name: b.name, phone: normalizePhone(b.phone) || null, email: b.email || null, address: b.address || null, router_id: num(b.router_id), package_id: num(b.package_id),
    pppoe_username: b.pppoe_username, pppoe_password: b.pppoe_password, remote_address: b.remote_address || null, local_address: b.local_address || null, olt_id: num(b.olt_id),
    onu_pon: b.onu_pon || null, onu_id: num(b.onu_id), onu_sn: b.onu_sn || null, onu_type: b.onu_type || null, onu_vlan: num(b.onu_vlan),
    billing_day: Math.min(28, Math.max(1, Number(b.billing_day) || 1)), notes: b.notes || null, install_date: b.install_date || null,
    latitude: num(b.latitude), longitude: num(b.longitude), odp_id: num(b.odp_id), updated_at: now() });
  if (body.sync_olt && b.olt_id && b.onu_pon && b.onu_id) {
    try { const olt = getDevice(db, b.olt_id); if (!zte.isZte(olt)) throw new Error(`${olt?.name || 'OLT'} bukan OLT ZTE – ubah PPPoE langsung di ONT`); zte.setPppoe(db, olt, { pon: b.onu_pon, onu: b.onu_id, username: b.pppoe_username }); } catch (e) { warnings.push('Sinkron OLT gagal: ' + e.message); }
  }
  logActivity(db, user.username, 'ubah_pelanggan', c.code, user.id);
  emit('customer:updated', { id: c.id });
  return { ok: true, warnings };
});
route('POST', '/customers/:id/isolate', C, ({ db, params, body, user }) => wrap(() => isolateCustomer(db, params.id, { actor: user.username, silent: !body.notify })));
route('POST', '/customers/:id/activate', C, ({ db, params, user }) => wrap(() => activateCustomer(db, params.id, { actor: user.username })));
route('POST', '/customers/:id/delete-pppoe', C, ({ db, params, body, user }) => deletePppoe(db, params.id, { actor: user.username, removeOnu: !!body.remove_onu }));
route('POST', '/customers/:id/kick', C, ({ db, params }) => wrap(() => { const c = getCustomer(db, params.id); return { kicked: mk.kickByName(db, getDevice(db, c.router_id), c.pppoe_username) }; }));
route('POST', '/customers/:id/reprovision', C, ({ db, params, user }) => wrap(() => {
  const c = getCustomer(db, params.id);
  mk.upsertSecret(db, getDevice(db, c.router_id), { name: c.pppoe_username, password: c.pppoe_password, profile: c.mikrotik_profile, remoteAddress: c.remote_address, localAddress: c.local_address, comment: `${c.code} | ${c.name}` });
  Object.assign(db.customers.find((x) => x.id === c.id), { status: 'active', isolated_at: null, deleted_at: null });
  logActivity(db, user.username, 'reprovision', c.code, user.id);
  return { ok: true };
}));
route('POST', '/customers/:id/send-account', C, ({ db, params, body, user }) => sendAccount(db, params.id, { resetPassword: body.reset_password !== false, actor: user.username }));
route('POST', '/customers/:id/app-password', C, ({ db, params, body }) => { const pw = body.password || randomString(6); db.customers.find((x) => x.id === Number(params.id)).app_password = pw; return { ok: true, password: pw }; });
route('POST', '/customers/:id/wa', C, ({ db, params, body }) => {
  const c = getCustomer(db, params.id);
  if (!body.message) fail(400, 'Pesan kosong');
  return sendWhatsapp(db, c.phone, fillTemplate(body.message, templateData(db, c)), { customerId: c.id, type: 'manual', throwOnError: true });
});
route('DELETE', '/customers/:id', C, ({ db, params, query, user }) => {
  const c = getCustomer(db, params.id) || fail(404, 'Pelanggan tidak ditemukan');
  const warnings = [];
  if (query.remove_device === '1') warnings.push(...deletePppoe(db, c.id, { actor: user.username, removeOnu: true }).errors);
  db.customers = db.customers.filter((x) => x.id !== c.id);
  db.invoices = db.invoices.filter((i) => i.customer_id !== c.id);
  db.payments = db.payments.filter((p) => p.customer_id !== c.id);
  logActivity(db, user.username, 'hapus_pelanggan', `${c.code} ${c.name}`, user.id);
  return { ok: true, warnings };
});
route('POST', '/customers/import', C, ({ db, body }) => wrap(() => {
  const router = getDevice(db, body.router_id);
  let imported = 0; const skipped = [];
  for (const s of mk.pppSecrets(db, router)) {
    if (s.service && !['pppoe', 'any'].includes(s.service)) continue;
    if (db.customers.some((c) => c.pppoe_username === s.name)) { skipped.push(s.name + ' (sudah ada)'); continue; }
    const pkg = db.packages.find((p) => p.mikrotik_profile === s.profile && (!p.router_id || p.router_id === Number(body.router_id)));
    if (!pkg) { skipped.push(`${s.name} (paket untuk profile ${s.profile} belum dibuat)`); continue; }
    insert(db, 'customers', { code: nextCode(db), name: (s.comment || s.name).slice(0, 150), phone: null, email: null, address: null, router_id: Number(body.router_id), package_id: pkg.id,
      pppoe_username: s.name, pppoe_password: s.password || '', remote_address: s['remote-address'] || null, local_address: null, olt_id: null, onu_pon: null, onu_id: null,
      onu_sn: null, onu_type: null, onu_vlan: null, billing_day: Number(body.billing_day) || 10, status: s.disabled === 'true' ? 'inactive' : 'active', install_date: null,
      latitude: null, longitude: null, odp_id: null, created_by: null, activated_at: now(), isolated_at: null, deleted_at: null, app_password: null, notes: null, created_at: now(), updated_at: now() });
    imported++;
  }
  return { imported, skipped };
}));

/* ======================= Pendaftaran (teknisi) ======================= */
const REG = ['customers.register', 'customers.manage'];
function regRow(db, c) {
  const u = db.users.find((x) => x.id === c.created_by); const o = db.odps.find((x) => x.id === c.odp_id);
  return { id: c.id, code: c.code, name: c.name, phone: c.phone, email: c.email, address: c.address, install_date: c.install_date, billing_day: c.billing_day,
    latitude: c.latitude, longitude: c.longitude, odp_id: c.odp_id, notes: c.notes, status: c.status, created_at: c.created_at, activated_at: c.activated_at,
    created_by: c.created_by, created_by_name: u?.name ?? null, odp_code: o?.code ?? null, odp_name: o?.name ?? null };
}
function regLoad(db, id, user, can) {
  const c = db.customers.find((x) => x.id === Number(id)) || fail(404, 'Data tidak ditemukan');
  if (!can('customers.manage') && c.created_by !== user.id) fail(403, 'Bukan data Anda');
  return c;
}
function regValidate(b) {
  const miss = [['name', 'Nama'], ['phone', 'No. WhatsApp'], ['install_date', 'Tanggal pasang'], ['address', 'Alamat'], ['latitude', 'Latitude'], ['longitude', 'Longitude']]
    .filter(([k]) => b[k] === undefined || b[k] === null || String(b[k]).trim() === '').map(([, l]) => l);
  if (miss.length) fail(400, 'Wajib diisi: ' + miss.join(', '));
  const lat = Number(b.latitude); const lng = Number(b.longitude);
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'Titik koordinat tidak valid');
}
route('GET', '/registrations', REG, ({ db, query: q, user, can }) => {
  const status = q.status || 'pending';
  const rows = db.customers.filter((c) => (can('customers.manage') ? (status === 'pending' ? c.status === 'pending' : c.created_by != null) : c.created_by === user.id)
    && like(q.q, c.name, c.phone, c.code));
  return sortBy(rows, (c) => c.id, true).slice(0, 500).map((c) => regRow(db, c));
});
route('GET', '/registrations/count', REG, ({ db }) => ({ pending: db.customers.filter((c) => c.status === 'pending').length }));
route('GET', '/registrations/:id', REG, ({ db, params, user, can }) => regRow(db, regLoad(db, params.id, user, can)));
route('POST', '/registrations', REG, ({ db, body: b, user }) => {
  regValidate(b);
  const code = nextCode(db);
  const c = insert(db, 'customers', { code, name: b.name, phone: normalizePhone(b.phone), email: b.email || null, address: b.address, router_id: null, package_id: null,
    pppoe_username: null, pppoe_password: null, remote_address: null, local_address: null, olt_id: null, onu_pon: null, onu_id: null, onu_sn: null, onu_type: null, onu_vlan: null,
    billing_day: billingDayFrom({ install_date: b.install_date }), status: 'pending', install_date: b.install_date, latitude: Number(b.latitude), longitude: Number(b.longitude),
    odp_id: num(b.odp_id), created_by: user.id, activated_at: null, isolated_at: null, deleted_at: null, app_password: null, notes: b.notes || null, created_at: now(), updated_at: now() });
  logActivity(db, user.username, 'pendaftaran_pelanggan', `${code} ${b.name} ${b.phone}`, user.id);
  emit('registration:new', { id: c.id, code, name: b.name, by: user.name || user.username });
  return { id: c.id, code };
});
route('PUT', '/registrations/:id', REG, ({ db, body, params, user, can }) => {
  const c = regLoad(db, params.id, user, can);
  if (c.status !== 'pending') fail(400, 'Data sudah diaktivasi, tidak bisa diubah dari sini');
  const b = { ...c, ...body }; regValidate(b);
  Object.assign(c, { name: b.name, phone: normalizePhone(b.phone), email: b.email || null, address: b.address, install_date: b.install_date, billing_day: billingDayFrom({ install_date: b.install_date }),
    latitude: Number(b.latitude), longitude: Number(b.longitude), odp_id: num(b.odp_id), notes: b.notes || null, updated_at: now() });
  logActivity(db, user.username, 'ubah_pendaftaran', c.code, user.id);
  emit('registration:updated', { id: c.id });
  return { ok: true };
});
route('DELETE', '/registrations/:id', REG, ({ db, params, user, can }) => {
  const c = regLoad(db, params.id, user, can);
  if (c.status !== 'pending') fail(400, 'Data sudah diaktivasi');
  db.customers = db.customers.filter((x) => x !== c);
  logActivity(db, user.username, 'hapus_pendaftaran', `${c.code} ${c.name}`, user.id);
  emit('registration:updated', { id: c.id });
  return { ok: true };
});
route('POST', '/registrations/:id/activate', ['customers.manage'], ({ db, body, params, user }) => provisionCustomer(db, body, { existingId: Number(params.id), user }));
