import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api.js';
import { COLORS, parseLatLng } from '../lib/geo.js';

export const DEFAULT_CENTER = { lat: -2.6786, lng: 118.8933, zoom: 13 }; // Mamuju, Sulawesi Barat

let configPromise = null;
/** Titik tengah peta dari Pengaturan (default Mamuju) */
export function getMapConfig() {
  configPromise ||= api.get('/network/config').catch(() => DEFAULT_CENTER);
  return configPromise;
}

/** Buat peta Leaflet dengan pilihan layer Peta / Satelit */
export function createMap(el, { lat, lng, zoom }) {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([lat, lng], zoom);
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagery &copy; Esri'
  });
  street.addTo(map);
  L.control.layers({ Peta: street, Satelit: sat }, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  return map;
}

/** Ikon pin (divIcon, tanpa file gambar) */
export function pinIcon(color, label = '') {
  return L.divIcon({
    className: 'nb-pin',
    html: `<div class="nb-pin-body" style="background:${color}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24]
  });
}

/**
 * Pemilih titik koordinat: klik peta / geser pin / tempel koordinat / lokasi GPS.
 * context: titik lain sebagai acuan, contoh ODC saat input ODP: [{lat,lng,color,label}]
 */
export function CoordinatePicker({ lat, lng, onChange, context = [], height = 280, line }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const ctxLayer = useRef(null);
  const [paste, setPaste] = useState('');
  const [gpsMsg, setGpsMsg] = useState('');
  const cb = useRef(onChange);
  cb.current = onChange;
  const set = (a, b) => cb.current(Number(Number(a).toFixed(7)), Number(Number(b).toFixed(7)));
  const has = lat !== '' && lat !== null && lat !== undefined && lng !== '' && lng !== null && lng !== undefined;

  useEffect(() => {
    let disposed = false;
    getMapConfig().then((cfg) => {
      if (disposed || !el.current) return;
      const start = has ? { lat: Number(lat), lng: Number(lng), zoom: 17 } : cfg;
      const map = createMap(el.current, start);
      mapRef.current = map;
      ctxLayer.current = L.layerGroup().addTo(map);
      map.on('click', (e) => set(e.latlng.lat, e.latlng.lng));
      setTimeout(() => map.invalidateSize(), 150);
    });
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // pin titik terpilih
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!has) { markerRef.current?.remove(); markerRef.current = null; return; }
    const ll = [Number(lat), Number(lng)];
    if (!markerRef.current) {
      markerRef.current = L.marker(ll, { draggable: true, icon: pinIcon('#0f766e', '●') }).addTo(map);
      markerRef.current.on('dragend', (e) => { const p = e.target.getLatLng(); set(p.lat, p.lng); });
    } else markerRef.current.setLatLng(ll);
    if (!map.getBounds().contains(ll)) map.setView(ll, Math.max(map.getZoom(), 16));
  });

  // titik acuan
  useEffect(() => {
    const layer = ctxLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const c of context) {
      L.circleMarker([c.lat, c.lng], { radius: 8, color: '#fff', weight: 2, fillColor: c.color, fillOpacity: 1 }).bindTooltip(c.label).addTo(layer);
    }
    if (line && has) {
      L.polyline([[line.lat, line.lng], [Number(lat), Number(lng)]], { color: line.color || COLORS.odc, weight: 3, dashArray: '6 6' }).addTo(layer);
    }
  });

  const gps = () => {
    if (!navigator.geolocation) return setGpsMsg('Browser tidak mendukung GPS');
    setGpsMsg('Mencari lokasi…');
    navigator.geolocation.getCurrentPosition(
      (p) => { set(p.coords.latitude, p.coords.longitude); setGpsMsg(`Akurasi ±${Math.round(p.coords.accuracy)} m`); },
      (e) => setGpsMsg('Gagal: ' + (e.code === 1 ? 'izin lokasi ditolak (website harus HTTPS)' : e.message)),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div className="picker">
      <div className="row" style={{ marginBottom: 8 }}>
        <input style={{ flex: 1, minWidth: 180 }} placeholder="Tempel koordinat / link Google Maps, mis. -2.6786, 118.8933" value={paste}
          onChange={(e) => { setPaste(e.target.value); const p = parseLatLng(e.target.value); if (p) set(p.lat, p.lng); }} />
        <button type="button" className="btn ghost sm" onClick={gps}>📍 Lokasi saya</button>
      </div>
      <div ref={el} style={{ height, borderRadius: 10, border: '1px solid var(--line)' }} />
      <div className="small muted" style={{ marginTop: 6 }}>Klik peta atau geser pin untuk menentukan titik. {gpsMsg}</div>
    </div>
  );
}
