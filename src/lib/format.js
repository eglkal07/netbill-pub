export const DEVICE_TYPE = {
  mikrotik: ['MikroTik', 'b-info'],
  olt_zte: ['OLT ZTE', 'b-warn'],
  olt_other: ['OLT lain', 'b-mute']
};

export const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function tgl(d, withTime = false) {
  if (!d) return '-';
  const x = new Date(String(d).replace(' ', 'T'));
  if (isNaN(x)) return d;
  const s = `${x.getDate()} ${BLN[x.getMonth()]} ${x.getFullYear()}`;
  return withTime ? `${s} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` : s;
}

export function periode(p) {
  if (!p) return '-';
  const [y, m] = p.split('-');
  return `${BULAN[Number(m) - 1]} ${y}`;
}

export const thisPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function bytes(n) {
  n = Number(n || 0);
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 2 : 1) + ' ' + u[i];
}

export const STATUS = {
  active: ['Aktif', 'b-ok'],
  isolated: ['Terisolir', 'b-bad'],
  inactive: ['Nonaktif', 'b-mute'],
  deleted: ['Dihapus', 'b-mute'],
  unpaid: ['Belum bayar', 'b-warn'],
  paid: ['Lunas', 'b-ok'],
  cancelled: ['Batal', 'b-mute'],
  pending: ['Menunggu', 'b-warn'],
  success: ['Berhasil', 'b-ok'],
  failed: ['Gagal', 'b-bad'],
  expired: ['Kedaluwarsa', 'b-mute'],
  online: ['Online', 'b-ok'],
  offline: ['Offline', 'b-bad'],
  unknown: ['Belum dicek', 'b-mute'],
  sent: ['Terkirim', 'b-ok']
};

export function toCSV(rows, columns) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  return head + '\n' + body;
}

export function download(filename, text, type = 'text/csv') {
  const blob = new Blob(['﻿' + text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Format bit per detik: 1670100000 -> "1.67 Gbps" */
export function bps(n) {
  n = Number(n || 0);
  const u = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(n >= 10 ? 1 : 2)} ${u[i]}`;
}

/** Format paket per detik: 172204 -> "172.2 K p/s" */
export function pps(n) {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' M p/s';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + ' K p/s';
  return Math.round(n) + ' p/s';
}
