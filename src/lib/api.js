// VERSI DEMO: tidak ada backend. Permintaan "/api/..." dijawab oleh API tiruan di peramban (src/mock/),
// dengan data awal dari src/data/demo-data.json. Antarmuka (api.get/post/put/del, qs) sama dengan versi asli.
import { handle } from '../mock/server.js';

export const getToken = () => localStorage.getItem('token');
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'));

const wait = () => new Promise((r) => setTimeout(r, 80 + Math.random() * 120)); // terasa seperti jaringan sungguhan

async function request(method, url, body) {
  await wait();
  const res = await handle(method, url, body, getToken());
  if (res.status === 401 && !url.startsWith('/auth/login')) {
    setToken(null);
    window.location.href = '/login';
  }
  if (res.status >= 400) throw new Error(res.body?.message || `HTTP ${res.status}`);
  return res.body;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  del: (u) => request('DELETE', u)
};

export const apiBase = '';

/** Helper query string */
export const qs = (obj) => {
  const s = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
  return s ? '?' + s : '';
};
