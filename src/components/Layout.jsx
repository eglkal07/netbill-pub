import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useToast } from './ui.jsx';
import { rupiah } from '../lib/format.js';

export const APP_NAME = 'NetBill';

// [path, icon, label, permission (salah satu)]
const NAV = [
  ['Utama', [['/', 'dashboard', 'Dashboard', ['dashboard.view']]]],
  ['Network & Data', [
    ['/network/assets', 'odp', 'ODC & ODP', ['network.view', 'network.manage']],
    ['/network/map', 'map', 'Peta Jaringan', ['network.view', 'network.manage']]
  ]],
  ['Pelanggan', [
    ['/registrations', 'clipboard', 'Pendaftaran', ['customers.register', 'customers.manage'], 'pending'],
    ['/customers', 'users', 'Pelanggan PPPoE', ['customers.manage']],
    ['/packages', 'package', 'Paket Internet', ['packages.manage']]
  ]],
  ['Keuangan', [
    ['/invoices', 'invoice', 'Tagihan', ['invoices.manage']],
    ['/payments', 'money', 'Pembayaran', ['payments.view']],
    ['/reports', 'report', 'Laporan', ['reports.view']]
  ]],
  ['Sistem', [
    ['/whatsapp', 'wa', 'WhatsApp', ['whatsapp.manage']],
    ['/activity', 'log', 'Log Aktivitas', ['logs.own']],
    ['/profile', 'user', 'Profil Saya', null]
  ]]
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);

  const loadPending = useCallback(() => {
    if (can('customers.manage')) api.get('/registrations/count').then((r) => setPending(r.pending)).catch(() => {});
  }, [can]);
  useEffect(() => { loadPending(); }, [loadPending]);

  useEffect(() => {
    const s = getSocket();
    const on = () => setLive(true);
    const off = () => setLive(false);
    const paid = (p) => can('payments.view', 'invoices.manage') && toast(`💰 ${p.customer_name} membayar ${rupiah(p.amount)} (${p.method})${p.activated ? ' – PPPoE diaktifkan' : ''}`, 'success');
    const reg = (r) => { if (can('customers.manage')) { toast(`📋 Pendaftaran baru: ${r.name} (oleh ${r.by})`, 'success'); loadPending(); } };
    const regUpd = () => loadPending();
    s.on('connect', on); s.on('disconnect', off); s.on('payment:paid', paid);
    s.on('registration:new', reg); s.on('registration:updated', regUpd);
    if (s.connected) setLive(true);
    return () => {
      s.off('connect', on); s.off('disconnect', off); s.off('payment:paid', paid);
      s.off('registration:new', reg); s.off('registration:updated', regUpd);
    };
  }, [toast, can, loadPending]);

  return (
    <div className="app">
      <aside className={`sidebar no-print ${open ? 'open' : ''}`}>
        <div className="brand"><div className="logo"><Icon name="wifi" size={18} /></div><div>NetBill<div className="brand-sub">Billing ISP</div></div></div>
        {NAV.map(([group, items]) => {
          const visible = items.filter(([, , , perm]) => !perm || can(...perm));
          if (!visible.length) return null;
          return (
            <div key={group}>
              <div className="nav-group">{group}</div>
              <nav className="nav">
                {visible.map(([to, icon, label, , badge]) => (
                  <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
                    <Icon name={icon} />{label}
                    {badge === 'pending' && pending > 0 && <span className="nav-badge">{pending}</span>}
                  </NavLink>
                ))}
              </nav>
            </div>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <div className="row">
            <button className="btn ghost sm menu-btn" onClick={() => setOpen(!open)}>☰</button>
            <span className="small muted"><span className={`live-dot ${live ? 'on' : ''}`} />{live ? 'Real-time terhubung' : 'Menghubungkan...'}</span>
          </div>
          <div className="row">
            <span className="small"><b>{user?.name}</b> <span className="role-chip">{user?.role_label || user?.role}</span></span>
            <button className="btn ghost sm" onClick={() => { logout(); nav('/login'); }}><Icon name="logout" size={15} />Keluar</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
