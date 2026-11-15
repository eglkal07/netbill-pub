// Simulasi integrasi untuk demo: MikroTik (secret PPPoE), OLT ZTE (registrasi ONU), dan WhatsApp.
// Tidak ada koneksi jaringan sungguhan; semua state disimpan di db.sim (lihat demo-data.json).
import { HttpError, now, normalizePhone, insert, emit, randomString } from './core.js';
import { getAllSettings } from './settings.js';

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

/* ======================= MikroTik (PPPoE) ======================= */
function router(db, device) {
  if (!device) throw new Error('Router belum dipilih / tidak ditemukan');
  if (device.type !== 'mikrotik') throw new Error(`${device.name} bukan router MikroTik`);
  if (device.last_status === 'offline') throw new Error(`Tidak dapat terhubung ke ${device.name} (${device.host}:${device.port}) – simulasi perangkat offline`);
  let r = db.sim.routers[device.id];
  if (!r) {
    r = db.sim.routers[device.id] = {
      identity: device.name.replace(/\s+/g, '-').toUpperCase(),
      resource: { 'board-name': 'hAP ax3', version: '7.16 (stable)', uptime: '1d2h', 'cpu-load': '3', 'free-memory': String(700 * 1048576), 'total-memory': String(1024 * 1048576) },
      ppp_profiles: [{ '.id': '*0', name: 'default', 'local-address': '', 'remote-address': '', 'rate-limit': '' }],
      ppp_secrets: [],
    };
  }
  return r;
}
const nid = (rows) => '*' + (rows.reduce((m, r) => Math.max(m, parseInt(String(r['.id']).replace(/\D/g, ''), 16) || 0), 0) + 1).toString(16).toUpperCase();
const mac = (s) => Array.from({ length: 6 }, (_, i) => ((hash(s + i) >>> 8) & 255).toString(16).padStart(2, '0').toUpperCase()).join(':');
const uptime = (s) => { const h = hash(s); return `${h % 9}d${(h >> 4) % 24}h${(h >> 9) % 60}m`; };

export const mk = {
  router,
  interfaces(db, d) {
    const r = router(db, d);
    const dyn = mk.pppActive(db, d).slice(0, 12).map((a) => ({ name: `<pppoe-${a.name}>`, type: 'pppoe-in', running: true, disabled: false, comment: '' }));
    return [...(r.interfaces || []), ...dyn];
  },
  pppProfiles(db, d) { return router(db, d).ppp_profiles; },
  pppSecrets(db, d) { return router(db, d).ppp_secrets; },
  /** Sesi aktif: semua secret yang tidak disabled dianggap online (kecuali ~10% acak tetap offline) */
  pppActive(db, d) {
    const r = router(db, d);
    return r.ppp_secrets.filter((s) => s.disabled !== 'true' && !s._kicked && hash(s.name) % 10 !== 0).map((s) => {
      const h = hash(s.name);
      return { '.id': '*A' + s['.id'].slice(1), name: s.name, service: 'pppoe', 'caller-id': mac(s.name),
        address: s.profile === 'ISOLIR' ? `10.200.${(h >> 3) % 4}.${(h % 250) + 2}` : (s['remote-address'] || `10.20.${(h >> 3) % 16}.${(h % 250) + 2}`), uptime: uptime(s.name) };
    });
  },
  getSecret(db, d, name) { return router(db, d).ppp_secrets.find((s) => s.name === name) || null; },
  kickByName(db, d, name) {
    const s = mk.getSecret(db, d, name);
    const was = s && mk.pppActive(db, d).some((a) => a.name === name);
    return was ? 1 : 0; // sesi langsung tersambung lagi (simulasi)
  },
  upsertSecret(db, d, { name, password, profile, remoteAddress, localAddress, comment, oldName }) {
    const r = router(db, d);
    if (!r.ppp_profiles.some((p) => p.name === profile)) throw new Error(`Profile "${profile}" tidak ada di ${d.name}. Pilih paket dengan profile yang tersedia di router tersebut.`);
    const ex = r.ppp_secrets.find((s) => s.name === (oldName || name)) || r.ppp_secrets.find((s) => s.name === name);
    const data = { name, password, profile, service: 'pppoe', 'remote-address': remoteAddress || null, 'local-address': localAddress || null, comment, disabled: 'false' };
    if (ex) { Object.assign(ex, data); return { updated: true }; }
    r.ppp_secrets.push({ '.id': nid(r.ppp_secrets), ...data });
    return { created: true };
  },
  removeSecret(db, d, name) {
    const r = router(db, d); const n = r.ppp_secrets.length;
    r.ppp_secrets = r.ppp_secrets.filter((s) => s.name !== name);
    return { removed: r.ppp_secrets.length < n };
  },
  setProfile(db, d, name, profile) {
    const s = mk.getSecret(db, d, name);
    if (!s) throw new Error(`Secret PPPoE "${name}" tidak ditemukan di ${d.name}`);
    if (!router(db, d).ppp_profiles.some((p) => p.name === profile)) throw new Error(`Profile "${profile}" belum ada di ${d.name}. Hubungi admin jaringan untuk membuat profile tersebut.`);
    s.profile = profile; s.disabled = 'false';
    return { ok: true };
  },
};

/* ======================= OLT ZTE ======================= */
function olt(db, device) {
  if (!device) throw new Error('OLT belum dipilih / tidak ditemukan');
  if (device.type !== 'olt_zte') throw new Error(`${device.name} bukan OLT ZTE – konfigurasi ONU dilakukan langsung di OLT/ONT`);
  if (device.last_status === 'offline') throw new Error(`Gagal login telnet ke OLT ${device.name}: simulasi perangkat offline`);
  if (!db.sim.olts[device.id]) db.sim.olts[device.id] = { version: 'ZXA10 C320 (simulasi)', card: '', onus: [], uncfg: [] };
  return db.sim.olts[device.id];
}
const cliLog = (cmds) => cmds.map((cmd) => ({ cmd, out: '' }));
export const zte = {
  isZte: (d) => d?.type === 'olt_zte',
  unconfigured(db, d) { return olt(db, d).uncfg; },
  nextOnuId(db, d, pon) {
    const used = olt(db, d).onus.filter((x) => x.pon === pon).map((x) => x.onu);
    for (let i = 1; i <= 128; i++) if (!used.includes(i)) return i;
    throw new Error('Port PON penuh (128 ONU)');
  },
  register(db, d, settings, p) {
    const o = olt(db, d);
    if (o.onus.some((x) => x.sn === p.sn)) throw new Error(`OLT menolak perintah "onu ... sn ${p.sn}": %Code 32310-GPONSRV : SN sudah terdaftar.`);
    const onu = p.onu ? Number(p.onu) : zte.nextOnuId(db, d, p.pon);
    if (o.onus.some((x) => x.pon === p.pon && x.onu === onu)) throw new Error(`ONU ID ${onu} sudah dipakai di ${p.pon}`);
    o.onus.push({ pon: p.pon, onu, type: p.type || settings.olt_default_onu_type || 'ZTE-F609', sn: p.sn, name: p.username, username: p.username, password: p.password, phase: 'working', rx: -20.5 });
    o.uncfg = o.uncfg.filter((u) => u.sn !== p.sn);
    return { onu, log: cliLog(['configure terminal', `interface gpon-olt_${p.pon}`, `onu ${onu} type ${p.type || 'ALL'} sn ${p.sn}`, 'exit', '(… template registrasi dari Pengaturan › OLT …)', 'exit']) };
  },
  setPppoe(db, d, { pon, onu, username }) {
    const x = olt(db, d).onus.find((o) => o.pon === pon && o.onu === Number(onu));
    if (!x) throw new Error(`ONU ${pon}:${onu} tidak ditemukan`);
    x.username = username;
    return { log: cliLog(['configure terminal', `pon-onu-mng gpon-onu_${pon}:${onu}`, `pppoe 1 nat enable user ${username} password ********`, 'exit', 'exit']) };
  },
  remove(db, d, pon, onu) {
    const o = olt(db, d);
    const x = o.onus.find((v) => v.pon === pon && v.onu === Number(onu));
    o.onus = o.onus.filter((v) => v !== x);
    if (x) o.uncfg.push({ pon, index: o.uncfg.filter((u) => u.pon === pon).length + 1, sn: x.sn, state: 'unknown' });
    return { log: cliLog(['configure terminal', `interface gpon-olt_${pon}`, `no onu ${onu}`, 'exit', 'exit']) };
  },
};

/* ======================= WhatsApp ======================= */
export function waStatus(db) { return { ...db.sim.wa }; }
export function setWa(db, data) { db.sim.wa = { ...db.sim.wa, ...data }; emit('wa:status', waStatus(db)); }

/** Kirim WA (simulasi): pesan dicatat di log WhatsApp, tidak ada pesan sungguhan yang terkirim */
export function sendWhatsapp(db, phone, message, { customerId = null, type = null, throwOnError = false } = {}) {
  const s = getAllSettings(db);
  const to = normalizePhone(phone);
  let error = null;
  if (!to) error = 'Nomor WhatsApp kosong';
  else if (s.wa_provider === 'none') error = 'Provider WhatsApp belum dipilih (Pengaturan › WhatsApp)';
  else if (s.wa_provider === 'baileys' && db.sim.wa.status !== 'connected') error = 'WhatsApp belum terhubung. Scan QR di menu WhatsApp.';
  else if (s.wa_provider === 'fonnte' && !s.wa_fonnte_token) error = 'Token Fonnte belum diisi';
  insert(db, 'wa_logs', { customer_id: customerId, phone: to || String(phone || ''), type, message, status: error ? 'failed' : 'sent', error, created_at: now() });
  if (error && throwOnError) throw new HttpError(502, error);
  return error ? { ok: false, error } : { ok: true, simulated: true };
}

/** Gambar "QR" tiruan (SVG) untuk simulasi scan WhatsApp */
export function demoQr() {
  const seed = randomString(16); let cells = '';
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    const finder = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
    const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x % 6 > 1 && x % 6 < 5 && y % 6 > 1 && y % 6 < 5) || x === 18 || x === 24 || y === 18 || y === 24) : (hash(seed + x + ',' + y) & 1);
    if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 29 33"><rect x="-2" y="-2" width="29" height="33" fill="#fff"/><g fill="#111">${cells}</g><text x="12.5" y="29.5" font-size="2.2" text-anchor="middle" font-family="sans-serif">SIMULASI – otomatis terhubung</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
