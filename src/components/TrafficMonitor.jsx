import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { bps, pps } from '../lib/format.js';
import LiveChart from './LiveChart.jsx';
import { useLoad } from './ui.jsx';

const RX = '#16a34a';
const TX = '#2563eb';
const MAX_POINTS = 600; // 10 menit @1 detik

const groupOf = (i) => {
  if (i.type === 'pppoe-in') return 'Pelanggan PPPoE';
  if (['ether', 'sfp', 'sfp-sfpplus', 'sfpplus', 'combo'].some((t) => i.type?.startsWith(t))) return 'Port fisik';
  if (i.type === 'vlan') return 'VLAN';
  if (i.type === 'bridge') return 'Bridge';
  if (['bond', 'bonding'].includes(i.type)) return 'Bonding';
  return 'Lainnya';
};

/** Monitor traffic interface MikroTik real-time (seperti Winbox, tampilan web) */
export default function TrafficMonitor() {
  const { data: routers } = useLoad(() => api.get('/devices'));
  const mikrotiks = (routers || []).filter((d) => d.type === 'mikrotik');
  const saved = JSON.parse(localStorage.getItem('traffic_sel') || '{}');
  const [routerId, setRouterId] = useState(saved.routerId || '');
  const [iface, setIface] = useState(saved.iface || '');
  const [ifaces, setIfaces] = useState([]);
  const [win, setWin] = useState(Number(saved.win) || 60);
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | connecting | live | error | paused
  const [error, setError] = useState('');
  const keyRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => { if (!routerId && mikrotiks.length) setRouterId(String(mikrotiks[0].id)); }, [mikrotiks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!routerId) return;
    setIfaces([]);
    api.get(`/devices/${routerId}/interfaces`).then((list) => {
      setIfaces(list);
      if (!list.find((i) => i.name === iface)) {
        const first = list.find((i) => groupOf(i) === 'Port fisik' && i.running) || list[0];
        setIface(first?.name || '');
      }
    }).catch((e) => { setError(e.message); setStatus('error'); });
  }, [routerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('traffic_sel', JSON.stringify({ routerId, iface, win }));
  }, [routerId, iface, win]);

  // berlangganan data traffic lewat Socket.IO
  useEffect(() => {
    if (!routerId || !iface) return undefined;
    const s = getSocket();
    setPoints([]);
    setError('');
    setStatus('connecting');
    pausedRef.current = false;
    const sub = () => s.emit('traffic:subscribe', { routerId, iface }, (r) => {
      if (r?.ok) { keyRef.current = r.key; setStatus('live'); } else { setError(r?.message || 'Gagal'); setStatus('error'); }
    });
    const onData = (d) => {
      if (d.key !== keyRef.current || pausedRef.current) return;
      setPoints((p) => { const n = [...p, d]; return n.length > MAX_POINTS ? n.slice(-MAX_POINTS) : n; });
    };
    const onErr = (e) => { if (e.key === keyRef.current) { setError(e.message); setStatus('error'); } };
    s.on('traffic:data', onData);
    s.on('traffic:error', onErr);
    s.on('connect', sub);
    if (s.connected) sub();
    return () => {
      s.emit('traffic:unsubscribe');
      s.off('traffic:data', onData); s.off('traffic:error', onErr); s.off('connect', sub);
      keyRef.current = null;
    };
  }, [routerId, iface]);

  const visible = useMemo(() => {
    if (!points.length) return [];
    const from = points[points.length - 1].t - win * 1000;
    return points.filter((p) => p.t >= from);
  }, [points, win]);

  const stat = (k) => {
    if (!visible.length) return { now: 0, avg: 0, max: 0 };
    const vals = visible.map((p) => p[k]);
    return { now: vals[vals.length - 1], avg: vals.reduce((a, b) => a + b, 0) / vals.length, max: Math.max(...vals) };
  };
  const rx = stat('rx'); const tx = stat('tx'); const rxp = stat('rxp'); const txp = stat('txp');
  const groups = ifaces.reduce((acc, i) => { (acc[groupOf(i)] ||= []).push(i); return acc; }, {});
  const togglePause = () => { pausedRef.current = !pausedRef.current; setStatus(pausedRef.current ? 'paused' : 'live'); };
  const cur = ifaces.find((i) => i.name === iface);

  return (
    <div className="card traffic-card">
      <div className="card-head">
        <div>
          <h2 className="row" style={{ gap: 8 }}>
            Traffic Real-time
            <span className={`pulse ${status}`} />
            <span className="small muted" style={{ fontWeight: 500 }}>
              {{ idle: '', connecting: 'menghubungkan…', live: 'live · 1 detik', paused: 'dijeda', error: 'terputus' }[status]}
            </span>
          </h2>
          {cur && <div className="small muted">{cur.name} · {cur.type}{cur.comment ? ` · ${cur.comment}` : ''} · {cur.running ? 'link ok' : 'link down'}</div>}
        </div>
        <div className="row">
          <select value={routerId} onChange={(e) => setRouterId(e.target.value)} style={{ width: 'auto' }}>
            {mikrotiks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={iface} onChange={(e) => setIface(e.target.value)} style={{ width: 'auto', maxWidth: 260 }}>
            {Object.entries(groups).map(([g, list]) => (
              <optgroup key={g} label={`${g} (${list.length})`}>
                {list.map((i) => <option key={i.name} value={i.name}>{i.running ? '●' : '○'} {i.name}{i.comment ? ` – ${i.comment}` : ''}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="seg">
            {[[60, '1m'], [300, '5m'], [600, '10m']].map(([v, l]) => <button key={v} className={win === v ? 'on' : ''} onClick={() => setWin(v)}>{l}</button>)}
          </div>
          <button className="btn ghost sm" onClick={togglePause} disabled={status !== 'live' && status !== 'paused'}>{status === 'paused' ? '▶ Lanjut' : '❚❚ Jeda'}</button>
        </div>
      </div>

      {!mikrotiks.length && <div className="alert warn">Belum ada router MikroTik.</div>}
      {error && <div className="alert bad">{error}</div>}

      <div className="traffic-stats">
        <div className="tstat" style={{ '--c': RX }}>
          <div className="tl"><span className="dot" style={{ background: RX }} />Rx · masuk</div>
          <div className="tv">{bps(rx.now)}</div>
          <div className="ts">rata-rata {bps(rx.avg)} · puncak {bps(rx.max)}</div>
        </div>
        <div className="tstat" style={{ '--c': TX }}>
          <div className="tl"><span className="dot" style={{ background: TX }} />Tx · keluar</div>
          <div className="tv">{bps(tx.now)}</div>
          <div className="ts">rata-rata {bps(tx.avg)} · puncak {bps(tx.max)}</div>
        </div>
        <div className="tstat" style={{ '--c': RX }}>
          <div className="tl">Rx packet</div>
          <div className="tv">{pps(rxp.now)}</div>
          <div className="ts">puncak {pps(rxp.max)}</div>
        </div>
        <div className="tstat" style={{ '--c': TX }}>
          <div className="tl">Tx packet</div>
          <div className="tv">{pps(txp.now)}</div>
          <div className="ts">puncak {pps(txp.max)}</div>
        </div>
      </div>

      <div className="grid g2 mt">
        <div>
          <div className="chart-title">Bandwidth</div>
          <LiveChart data={visible} windowSec={win} format={bps} series={[{ key: 'rx', label: 'Rx', color: RX }, { key: 'tx', label: 'Tx', color: TX }]} />
        </div>
        <div>
          <div className="chart-title">Paket</div>
          <LiveChart data={visible} windowSec={win} format={pps} series={[{ key: 'rxp', label: 'Rx', color: RX }, { key: 'txp', label: 'Tx', color: TX }]} />
        </div>
      </div>
    </div>
  );
}
