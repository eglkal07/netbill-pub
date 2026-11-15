import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STATUS } from '../lib/format.js';

// ================= Toast =================
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), type === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ================= Data loader =================
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await fn()); } catch (e) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

/** Jalankan aksi async dengan toast sukses/gagal */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'success');
      if (r?.warnings?.length) r.warnings.forEach((w) => toast(w, 'error'));
      return r;
    } catch (e) {
      toast(e.message, 'error');
      return undefined;
    } finally { setBusy(false); }
  }, [toast]);
  return [run, busy];
}

// ================= Komponen =================
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ s, label }) {
  const [txt, cls] = STATUS[s] || [s, 'b-mute'];
  return <span className={`badge ${cls}`}>{label || txt}</span>;
}

export function Field({ label, hint, children }) {
  return <div className="field"><label>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([k, l]) => <button key={k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export const Spinner = () => <span className="spinner" />;

export function Loading({ loading, error, children }) {
  if (loading) return <div className="empty"><Spinner /></div>;
  if (error) return <div className="alert bad">{error}</div>;
  return children;
}

export function Empty({ text = 'Belum ada data' }) {
  return <div className="empty">{text}</div>;
}

/** Bar chart SVG sederhana */
export function BarChart({ data, height = 220, format = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 3 - 2);
          return (
            <rect key={i} className="chart-bar" x={i * w + w * 0.15} y={height / 3 - h} width={w * 0.7} height={Math.max(h, 0.2)} rx="0.6">
              <title>{d.label}: {format(d.value)}</title>
            </rect>
          );
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
        {data.map((d, i) => <span key={i}>{d.short ?? d.label}</span>)}
      </div>
    </div>
  );
}

/** Pilih perangkat (router / OLT) */
export function DeviceSelect({ devices, value, onChange, type, placeholder = '- pilih -' }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {(devices || []).filter((d) => !type || (Array.isArray(type) ? type.includes(d.type) : d.type === type)).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.vendor || d.host}){d.type === 'olt_other' ? ' – tanpa konfigurasi' : ''}</option>)}
    </select>
  );
}
