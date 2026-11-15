import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { closeSocket } from './socket.js';

const AuthCtx = createContext(null);

/** Urutan halaman awal sesuai hak akses (dipakai bila user tidak punya akses dashboard) */
export const HOME_ROUTES = [
  ['/', 'dashboard.view'],
  ['/customers', 'customers.manage'],
  ['/registrations', 'customers.register'],
  ['/network/map', 'network.view'],
  ['/invoices', 'invoices.manage'],
  ['/payments', 'payments.view'],
  ['/reports', 'reports.view'],
  ['/activity', 'logs.own']
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => api.get('/auth/me').then(setUser), []);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    refresh().catch(() => setToken(null)).finally(() => setReady(true));
  }, [refresh]);

  const login = async (username, password) => {
    const r = await api.post('/auth/login', { username, password });
    setToken(r.token);
    setUser(r.user);
  };
  const logout = () => { setToken(null); setUser(null); closeSocket(); };

  /** can('a') atau can('a','b') -> true bila punya salah satu */
  const can = useCallback((...keys) => !!user && keys.some((k) => user.permissions?.includes(k)), [user]);
  const home = () => HOME_ROUTES.find(([, p]) => can(p))?.[0] || '/profile';

  return <AuthCtx.Provider value={{ user, ready, login, logout, can, refresh, home }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
