// Pengaturan & RBAC (disalin dari backend/src/services/settings.js & rbac.js).
export const DEFAULT_SETTINGS = {
  company_name: 'NetBill',
  company_phone: '',
  company_address: '',
  // Billing
  isolir_profile: 'ISOLIR',
  grace_days: '0',                 // toleransi hari setelah jatuh tempo sebelum isolir
  invoice_days_before: '10',       // tagihan dibuat N hari sebelum jatuh tempo
  reminder_days_before: '5',       // WA pengingat N hari sebelum jatuh tempo
  reminder_hour: '09:00',
  auto_delete_days: '90',          // hapus PPPoE jika tidak aktif (terisolir) selama N hari (3 bulan)
  auto_delete_onu: '1',            // ikut hapus ONU di OLT saat auto delete
  auto_isolir_enabled: '1',
  auto_delete_enabled: '1',
  // Midtrans
  midtrans_server_key: '',
  midtrans_client_key: '',
  midtrans_is_production: '0',
  midtrans_finish_url: '',
  // WhatsApp
  wa_provider: 'none',             // none | baileys | fonnte | custom (demo: semua disimulasikan)
  wa_fonnte_token: '',
  wa_custom_url: '',               // contoh: https://gateway/send  (POST JSON {phone, message})
  wa_custom_header: '',            // contoh: Authorization: Bearer xxx
  wa_send_on_create: '1',
  wa_send_invoice: '1',
  wa_send_paid: '1',
  wa_send_isolir: '1',
  wa_tpl_account:
`Halo *{nama}*,
Terima kasih telah berlangganan *{perusahaan}*.

Detail akun Anda:
• ID Pelanggan : {kode}
• Paket        : {paket} ({harga}/bulan)
• User PPPoE   : {username}
• Pass PPPoE   : {password}
• Jatuh tempo  : setiap tanggal {tgl_tempo}

Login Aplikasi Pelanggan (Android):
• Username : {kode}
• Password : {app_password}

Simpan pesan ini baik-baik. Terima kasih 🙏`,
  wa_tpl_reminder:
`Halo *{nama}*,
Ini pengingat bahwa tagihan internet Anda periode *{periode}* sebesar *{tagihan}* akan jatuh tempo pada *{jatuh_tempo}* ({sisa_hari} hari lagi).

No. Tagihan: {no_tagihan}
Bayar online: {link_bayar}
atau melalui aplikasi pelanggan.

Abaikan pesan ini jika sudah membayar. Terima kasih - {perusahaan}`,
  wa_tpl_invoice:
`Halo *{nama}*,
Tagihan internet periode *{periode}* telah terbit.
Nominal : *{tagihan}*
Jatuh tempo : {jatuh_tempo}
No. Tagihan: {no_tagihan}
Bayar online: {link_bayar}

- {perusahaan}`,
  wa_tpl_paid:
`Halo *{nama}*,
Pembayaran tagihan *{periode}* sebesar *{tagihan}* telah kami terima ✅
Metode: {metode}
Layanan internet Anda aktif. Terima kasih - {perusahaan}`,
  wa_tpl_isolir:
`Halo *{nama}*,
Layanan internet Anda sementara *diisolir* karena tagihan *{periode}* sebesar *{tagihan}* belum dibayar (jatuh tempo {jatuh_tempo}).
Silakan lakukan pembayaran agar layanan aktif kembali otomatis: {link_bayar}

- {perusahaan}`,
  // Template aktivasi ONT ZTE C320 (sesuaikan dengan konfigurasi OLT Anda)
  olt_register_template:
`configure terminal
interface gpon-olt_{pon}
onu {onu} type {type} sn {sn}
exit
interface gpon-onu_{pon}:{onu}
name {username}
tcont 1 profile {tcont_profile}
gemport 1 tcont 1
gemport 1 traffic-limit downstream {traffic_profile}
service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
exit
pon-onu-mng gpon-onu_{pon}:{onu}
flow mode 1 tag-filter vlan-filter untag-filter discard
flow 1 pri 0 vlan {vlan}
gemport 1 flow 1
switchport-bind switch_0/1 iphost 1
switchport-bind switch_0/1 veip 1
pppoe 1 nat enable user {username} password {password}
vlan-filter-mode iphost 1 tag-filter vlan-filter untag-filter discard
vlan-filter iphost 1 pri 0 vlan {vlan}
dhcp-ip ethuni eth_0/1 from-onu
dhcp-ip ethuni eth_0/2 from-onu
dhcp-ip ethuni eth_0/3 from-onu
dhcp-ip ethuni eth_0/4 from-onu
security-mgmt 1 state enable mode forward protocol web
security-mgmt 1 start-src-ip 172.16.0.0 end-src-ip 172.16.255.255
security-mgmt 2 state enable mode forward protocol web
security-mgmt 2 start-src-ip 10.0.0.0 end-src-ip 10.255.255.255
security-mgmt 998 state enable mode forward ingress-type lan
security-mgmt 999 state enable ingress-type lan protocol ftp telnet ssh snmp tr069
exit
exit`,
  olt_pppoe_template:
`configure terminal
pon-onu-mng gpon-onu_{pon}:{onu}
pppoe 1 nat enable user {username} password {password}
exit
exit`,
  olt_default_tcont_profile: 'EYZET-1G-UP',
  olt_default_traffic_profile: 'EYZET-1G-DOWN',
  olt_default_vlan_profile: 'pppoe',
  olt_default_vlan: '20',
  olt_default_onu_type: 'ALL',
  // Peta (Network & Data) – default wilayah Mamuju, Sulawesi Barat
  map_center_lat: '-2.6786',
  map_center_lng: '118.8933',
  map_zoom: '13'
};

export function getAllSettings(db) {
  return { ...DEFAULT_SETTINGS, ...db.settings };
}
export function setSettings(db, obj) {
  for (const [k, v] of Object.entries(obj)) if (k in DEFAULT_SETTINGS) db.settings[k] = v == null ? '' : String(v);
  return getAllSettings(db);
}

/** Pengaturan yang aman untuk ditampilkan (kunci rahasia disamarkan) */
export function maskSecrets(s) {
  const out = { ...s };
  for (const k of ['midtrans_server_key', 'wa_fonnte_token']) {
    if (out[k]) out[k] = out[k].slice(0, 6) + '••••••' + out[k].slice(-4);
  }
  return out;
}


export const PERMISSIONS = [
  { key: 'dashboard.view', group: 'Utama', label: 'Lihat dashboard & ringkasan keuangan' },
  { key: 'dashboard.traffic', group: 'Utama', label: 'Monitor traffic interface real-time' },


  { key: 'network.view', group: 'Network & Data', label: 'Lihat ODC, ODP & peta' },
  { key: 'network.manage', group: 'Network & Data', label: 'Tambah / ubah / hapus ODC & ODP' },

  { key: 'customers.manage', group: 'Pelanggan', label: 'Kelola pelanggan PPPoE (tambah, isolir, aktivasi, hapus)' },
  { key: 'customers.register', group: 'Pelanggan', label: 'Input pendaftaran pelanggan baru (data lapangan)' },
  { key: 'packages.manage', group: 'Pelanggan', label: 'Kelola paket internet' },

  { key: 'invoices.manage', group: 'Keuangan', label: 'Kelola tagihan & terima pembayaran manual' },
  { key: 'payments.view', group: 'Keuangan', label: 'Lihat riwayat pembayaran' },
  { key: 'reports.view', group: 'Keuangan', label: 'Lihat laporan bulanan & tahunan' },

  { key: 'whatsapp.manage', group: 'Sistem', label: 'WhatsApp (koneksi, broadcast, log)' },
  { key: 'settings.manage', group: 'Sistem', label: 'Ubah pengaturan aplikasi' },
  { key: 'logs.own', group: 'Sistem', label: 'Lihat log aktivitas sendiri' }
];

export const ALL_KEYS = PERMISSIONS.map((p) => p.key);

export const DEFAULT_ROLES = [
  {
    name: 'operator', label: 'Operator', is_system: 1,
    description: 'Pelanggan & aktivasi (perangkat diatur admin), tagihan, pembayaran, laporan, kirim WhatsApp, traffic real-time',
    permissions: ALL_KEYS.filter((k) => k !== 'settings.manage')
  },
  {
    name: 'teknisi', label: 'Teknisi', is_system: 1,
    description: 'Input pendaftaran pelanggan dari lapangan & data ODC/ODP',
    permissions: ['customers.register', 'network.view', 'network.manage', 'logs.own']
  }
];

export function getRoles(db) {
  return db.roles.map((r) => ({ ...r, permissions: (r.permissions || []).filter((k) => ALL_KEYS.includes(k)) }));
}
export const permissionsOf = (db, role) => getRoles(db).find((r) => r.name === role)?.permissions || [];
