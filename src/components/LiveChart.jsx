import { useEffect, useMemo, useRef, useState } from 'react';

/** Batas atas sumbu Y yang "bulat" (1, 2, 2.5, 5 x 10^n) */
function niceMax(v, ticks = 4) {
  if (!v || v <= 0) return ticks;
  const raw = v / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return step * ticks;
}

const pad = (n) => String(n).padStart(2, '0');
const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/**
 * Grafik garis + area real-time (SVG).
 * data: [{ t, [series.key]: number }]   series: [{ key, label, color }]
 */
export default function LiveChart({ data, series, windowSec = 60, height = 230, format = (v) => v }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const M = { l: 8, r: 84, t: 10, b: 24 };
  const W = width - M.l - M.r;
  const H = height - M.t - M.b;
  const end = data.length ? data[data.length - 1].t : Date.now();
  const start = end - windowSec * 1000;
  const pts = data.filter((d) => d.t >= start - 1000);
  const max = niceMax(Math.max(0, ...pts.flatMap((d) => series.map((s) => d[s.key] || 0))));
  const x = (t) => M.l + ((t - start) / (windowSec * 1000)) * W;
  const y = (v) => M.t + H - (v / max) * H;

  const paths = useMemo(() => series.map((s) => {
    if (pts.length < 2) return { ...s, line: '', area: '' };
    // kurva halus (monotone-ish) dengan titik kontrol tengah
    let line = `M${x(pts[0].t)},${y(pts[0][s.key] || 0)}`;
    for (let i = 1; i < pts.length; i++) {
      const x0 = x(pts[i - 1].t); const x1 = x(pts[i].t);
      const y0 = y(pts[i - 1][s.key] || 0); const y1 = y(pts[i][s.key] || 0);
      const cx = (x0 + x1) / 2;
      line += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    const area = `${line} L${x(pts[pts.length - 1].t)},${M.t + H} L${x(pts[0].t)},${M.t + H} Z`;
    return { ...s, line, area };
  }), [pts, series, max, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e) => {
    if (!pts.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = start + ((px - M.l) / W) * windowSec * 1000;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    setHover(best);
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => start + f * windowSec * 1000);
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);

  return (
    <div ref={wrap} className="live-chart" style={{ position: 'relative' }}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${uid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
          <clipPath id={`c-${uid}`}><rect x={M.l} y={M.t - 2} width={W} height={H + 4} /></clipPath>
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={M.l} x2={M.l + W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={i === 0 ? '' : '3 4'} />
            <text x={M.l + W + 8} y={y(v) + 4} fontSize="11" fill="var(--muted)">{format(v)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={height - 6} fontSize="10.5" fill="var(--muted)" textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{clock(t)}</text>
        ))}
        <g clipPath={`url(#c-${uid})`}>
          {paths.map((p) => <path key={p.key + 'a'} d={p.area} fill={`url(#g-${uid}-${p.key})`} />)}
          {paths.map((p) => <path key={p.key + 'l'} d={p.line} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" />)}
        </g>
        {hover && (
          <g>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={M.t} y2={M.t + H} stroke="#94a3b8" strokeDasharray="3 3" />
            {series.map((s) => <circle key={s.key} cx={x(hover.t)} cy={y(hover[s.key] || 0)} r="4" fill="#fff" stroke={s.color} strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(x(hover.t) + 12, width - 190), top: 8 }}>
          <div className="muted small">{clock(hover.t)}</div>
          {series.map((s) => (
            <div key={s.key} className="row" style={{ gap: 6 }}><span className="dot" style={{ background: s.color }} />{s.label}<b style={{ marginLeft: 'auto' }}>{format(hover[s.key] || 0)}</b></div>
          ))}
        </div>
      )}
      {!pts.length && <div className="chart-empty">Menunggu data...</div>}
    </div>
  );
}
