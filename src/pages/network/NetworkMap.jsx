import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { api } from '../../lib/api.js';
import { COLORS, distance, fmtDistance, gmapsLink, hasCoord } from '../../lib/geo.js';
import { createMap } from '../../components/map.jsx';
import { Loading, useLoad } from '../../components/ui.jsx';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const custColor = (s) => COLORS[s] || COLORS.other;
const STATUS_LABEL = { active: 'Aktif', isolated: 'Terisolir', pending: 'Pendaftaran', inactive: 'Nonaktif' };

/** Peta jaringan: ODC (hijau), ODP (kuning), jalur ODC→ODP, dan pelanggan */
export default function NetworkMap() {
  const { data, loading, error, reload } = useLoad(() => api.get('/network/map'));
  const el = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const markers = useRef({});
  const [show, setShow] = useState({ odc: true, odp: true, cable: true, customer: true, drop: false });
  const [q, setQ] = useState('');

  // inisialisasi peta sekali setelah data pertama datang
  useEffect(() => {
    if (!data || mapRef.current || !el.current) return;
    const map = createMap(el.current, data.config);
    mapRef.current = map;
    for (const k of ['cable', 'drop', 'customer', 'odp', 'odc']) layers.current[k] = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
  }, [data]);
  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  // gambar ulang titik & jalur
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    Object.values(layers.current).forEach((l) => l.clearLayers());
    markers.current = {};
    const odcById = Object.fromEntries(data.odcs.map((o) => [o.id, o]));
    const odpById = Object.fromEntries(data.odps.map((o) => [o.id, o]));
    const bounds = [];

    // jalur kabel ODC -> ODP
    for (const p of data.odps) {
      const c = odcById[p.odc_id];
      if (!c) continue;
      const a = [+c.latitude, +c.longitude]; const b = [+p.latitude, +p.longitude];
      L.polyline([a, b], { color: '#f59e0b', weight: 3, opacity: 0.85 })
        .bindTooltip(`${c.code} → ${p.code} · ±${fmtDistance(distance(a, b))}`, { sticky: true })
        .addTo(layers.current.cable);
    }

    // pelanggan + kabel drop ODP -> pelanggan
    for (const c of data.customers.filter(hasCoord)) {
      const ll = [+c.latitude, +c.longitude];
      const odp = odpById[c.odp_id];
      if (odp) {
        L.polyline([[+odp.latitude, +odp.longitude], ll], { color: '#94a3b8', weight: 1.5, dashArray: '4 4' }).addTo(layers.current.drop);
      }
      const m = L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: custColor(c.status), fillOpacity: 0.95 })
        .bindPopup(`<b>${esc(c.name)}</b><br>${esc(c.code)} · ${STATUS_LABEL[c.status] || c.status}${odp ? `<br>ODP: ${esc(odp.code)} (±${fmtDistance(distance([+odp.latitude, +odp.longitude], ll))})` : ''}
          <br><a href="${gmapsLink(c.latitude, c.longitude)}" target="_blank">Buka di Google Maps</a>`)
        .addTo(layers.current.customer);
      markers.current[`c${c.id}`] = m;
      bounds.push(ll);
    }

    // ODP (kuning)
    for (const p of data.odps) {
      const ll = [+p.latitude, +p.longitude];
      const c = odcById[p.odc_id];
      const m = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: COLORS.odp, fillOpacity: 1 })
        .bindTooltip(p.code, { direction: 'top', offset: [0, -6] })
        .bindPopup(`<div class="pop"><div class="pop-tag" style="background:${COLORS.odp}">ODP</div><b>${esc(p.code)} – ${esc(p.name)}</b>
          <div>Induk: ${c ? `${esc(c.code)} ${esc(c.name)}${p.odc_port ? ` (port ${esc(p.odc_port)})` : ''}` : '<i>tidak ada</i>'}</div>
          ${c ? `<div>Jarak ke ODC: ±${fmtDistance(distance([+c.latitude, +c.longitude], ll))}</div>` : ''}
          <div>Pelanggan: <b>${p.customer_count}/${p.capacity}</b> port</div>
          ${p.address ? `<div>${esc(p.address)}</div>` : ''}
          <div class="mono">${Number(p.latitude).toFixed(6)}, ${Number(p.longitude).toFixed(6)}</div>
          <a href="${gmapsLink(p.latitude, p.longitude)}" target="_blank">Navigasi Google Maps</a></div>`)
        .addTo(layers.current.odp);
      markers.current[`p${p.id}`] = m;
      bounds.push(ll);
    }

    // ODC (hijau)
    for (const o of data.odcs) {
      const ll = [+o.latitude, +o.longitude];
      const m = L.circleMarker(ll, { radius: 11, color: '#fff', weight: 3, fillColor: COLORS.odc, fillOpacity: 1 })
        .bindTooltip(o.code, { direction: 'top', offset: [0, -8], permanent: data.odcs.length <= 30, className: 'odc-label' })
        .bindPopup(`<div class="pop"><div class="pop-tag" style="background:${COLORS.odc}">ODC</div><b>${esc(o.code)} – ${esc(o.name)}</b>
          <div>ODP terhubung: <b>${o.odp_count}/${o.capacity}</b></div>
          ${o.pon_port ? `<div>PON OLT: ${esc(o.pon_port)}</div>` : ''}
          ${o.address ? `<div>${esc(o.address)}</div>` : ''}
          <div class="mono">${Number(o.latitude).toFixed(6)}, ${Number(o.longitude).toFixed(6)}</div>
          <a href="${gmapsLink(o.latitude, o.longitude)}" target="_blank">Navigasi Google Maps</a></div>`)
        .addTo(layers.current.odc);
      markers.current[`o${o.id}`] = m;
      bounds.push(ll);
    }

    if (bounds.length && !map._fitted) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 }); map._fitted = true; }
  }, [data]);

  // tampil / sembunyikan layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [k, on] of Object.entries(show)) {
      const l = layers.current[k];
      if (!l) continue;
      if (on && !map.hasLayer(l)) l.addTo(map);
      if (!on && map.hasLayer(l)) map.removeLayer(l);
    }
  }, [show, data]);

  const list = useMemo(() => {
    if (!data) return [];
    const all = [
      ...data.odcs.map((o) => ({ key: `o${o.id}`, type: 'ODC', color: COLORS.odc, title: `${o.code} – ${o.name}`, sub: `${o.odp_count}/${o.capacity} ODP` })),
      ...data.odps.map((o) => ({ key: `p${o.id}`, type: 'ODP', color: COLORS.odp, title: `${o.code} – ${o.name}`, sub: `${o.customer_count}/${o.capacity} pelanggan` })),
      ...data.customers.filter(hasCoord).map((c) => ({ key: `c${c.id}`, type: 'PLG', color: custColor(c.status), title: c.name, sub: c.code }))
    ];
    const s = q.toLowerCase();
    return (s ? all.filter((x) => `${x.title} ${x.sub}`.toLowerCase().includes(s)) : all.filter((x) => x.type !== 'PLG')).slice(0, 200);
  }, [data, q]);

  const focus = (key) => {
    const m = markers.current[key];
    if (!m || !mapRef.current) return;
    mapRef.current.flyTo(m.getLatLng(), 18, { duration: 0.6 });
    setTimeout(() => m.openPopup(), 650);
  };

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const nCust = data?.customers.filter(hasCoord).length || 0;

  return (
    <>
      <div className="page-head">
        <div><h1>Peta Jaringan</h1><p>Penempatan ODC (hijau), ODP (kuning) & jalur kabel yang menghubungkannya</p></div>
        <div className="row"><button className="btn ghost" onClick={reload}>Muat ulang</button><Link className="btn" to="/network/assets">Kelola ODC & ODP</Link></div>
      </div>
      <Loading loading={loading && !data} error={error}>
        <div className="map-layout">
          <div className="map-side card">
            <input placeholder="Cari ODC / ODP / pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="map-toggles">
              <label className="check"><input type="checkbox" checked={show.odc} onChange={() => toggle('odc')} /><span className="dot lg" style={{ background: COLORS.odc }} />ODC ({data?.odcs.length || 0})</label>
              <label className="check"><input type="checkbox" checked={show.odp} onChange={() => toggle('odp')} /><span className="dot lg" style={{ background: COLORS.odp }} />ODP ({data?.odps.length || 0})</label>
              <label className="check"><input type="checkbox" checked={show.cable} onChange={() => toggle('cable')} /><span className="line-swatch" />Jalur ODC → ODP</label>
              <label className="check"><input type="checkbox" checked={show.customer} onChange={() => toggle('customer')} /><span className="dot" style={{ background: COLORS.active }} />Pelanggan ({nCust})</label>
              <label className="check"><input type="checkbox" checked={show.drop} onChange={() => toggle('drop')} /><span className="line-swatch dashed" />Kabel drop ODP → pelanggan</label>
            </div>
            <div className="map-legend small">
              <span><span className="dot" style={{ background: COLORS.active }} />aktif</span>
              <span><span className="dot" style={{ background: COLORS.isolated }} />isolir</span>
              <span><span className="dot" style={{ background: COLORS.pending }} />pendaftaran</span>
            </div>
            <div className="map-list">
              {list.map((x) => (
                <button key={x.key} onClick={() => focus(x.key)}>
                  <span className="dot" style={{ background: x.color }} />
                  <span style={{ flex: 1, minWidth: 0 }}><b>{x.title}</b><div className="small muted">{x.type} · {x.sub}</div></span>
                </button>
              ))}
              {!list.length && <div className="empty small">Tidak ada data</div>}
            </div>
          </div>
          <div ref={el} className="map-canvas" />
        </div>
      </Loading>
    </>
  );
}
