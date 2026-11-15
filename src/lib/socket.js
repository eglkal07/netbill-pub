// VERSI DEMO: pengganti Socket.IO. Event realtime (pembayaran, pendaftaran, status WA, dll.) berasal dari API tiruan
// lewat bus lokal + BroadcastChannel (antar-tab), dan data traffic interface dibangkitkan secara simulasi.
import { bus } from '../mock/core.js';
import { load, save } from '../mock/db.js';
import { permissionsOf } from '../mock/settings.js';
import { uidFromToken } from '../mock/routes-a.js';
import { setWa } from '../mock/sim.js';
import { getToken } from './api.js';

let socket = null;

/** Profil traffic per jenis interface (bps rata-rata download) */
function baseFor(iface) {
  if (/WAN|sfp/i.test(iface)) return 380e6;
  if (/OLT|pppoe|vlan20/i.test(iface)) return 260e6;
  if (/hotspot/i.test(iface)) return 45e6;
  if (/^<pppoe-/.test(iface)) return 6e6;
  if (/mgmt/i.test(iface)) return 0.4e6;
  return 15e6;
}

function createSocket() {
  const local = new Map(); // event -> Set(fn)
  let traffic = null;
  const s = {
    connected: true,
    on(ev, fn) { if (!local.has(ev)) local.set(ev, new Set()); local.get(ev).add(fn); bus.on(ev, fn); return s; },
    off(ev, fn) { local.get(ev)?.delete(fn); bus.off(ev, fn); return s; },
    emit(ev, data, ack) {
      if (ev === 'traffic:subscribe') return subscribe(data || {}, ack);
      if (ev === 'traffic:unsubscribe') { stopTraffic(); return undefined; }
      return undefined;
    },
    disconnect() { stopTraffic(); for (const [ev, fns] of local) for (const fn of fns) bus.off(ev, fn); local.clear(); s.connected = false; },
  };
  const fire = (ev, data) => { for (const fn of [...(local.get(ev) || [])]) fn(data); };
  function stopTraffic() { if (traffic) clearInterval(traffic.timer); traffic = null; }
  function subscribe({ routerId, iface }, ack) {
    stopTraffic();
    const db = load();
    const u = db.users.find((x) => x.id === uidFromToken(getToken()));
    if (!u || !permissionsOf(db, u.role).includes('dashboard.traffic')) return ack?.({ ok: false, message: 'Tidak punya akses monitor traffic' });
    if (!routerId || !iface) return ack?.({ ok: false, message: 'Router & interface wajib dipilih' });
    const dev = db.devices.find((d) => d.id === Number(routerId));
    if (!dev || dev.last_status === 'offline') return ack?.({ ok: false, message: `Gagal terhubung ke ${dev?.name || 'router'} (simulasi offline)` });
    const key = `${routerId}::${iface}`;
    const base = baseFor(iface);
    let rx = base * (0.7 + Math.random() * 0.3); let tx = rx * 0.18;
    traffic = { key, timer: setInterval(() => {
      const hour = new Date().getHours(); const peak = hour >= 19 && hour <= 23 ? 1.25 : hour >= 1 && hour <= 6 ? 0.45 : 1;
      rx = Math.max(base * 0.05, rx + (base * peak - rx) * 0.15 + (Math.random() - 0.5) * base * 0.25);
      tx = Math.max(base * 0.01, tx + (rx * 0.18 - tx) * 0.3 + (Math.random() - 0.5) * base * 0.05);
      fire('traffic:data', { key, t: Date.now(), rx: Math.round(rx), tx: Math.round(tx), rxp: Math.round(rx / 8 / 900), txp: Math.round(tx / 8 / 700) });
    }, 1000) };
    setTimeout(() => ack?.({ ok: true, key }), 150);
    return undefined;
  }
  return s;
}

export function getSocket() {
  if (!socket) socket = createSocket();
  return socket;
}
export function closeSocket() { socket?.disconnect(); socket = null; }

// Simulasi scan QR WhatsApp: beberapa detik setelah QR tampil, status otomatis "connected"
bus.on('wa:status', (st) => {
  if (st?.status !== 'qr') return;
  setTimeout(() => {
    const db = load();
    if (db.sim.wa.status !== 'qr') return;
    setWa(db, { status: 'connected', qr: null, me: '6281200000000' });
    save(db);
  }, 6000);
});
