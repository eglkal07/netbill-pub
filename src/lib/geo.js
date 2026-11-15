/** Jarak dua titik (meter) – rumus haversine */
export function distance(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/**
 * Baca teks koordinat: "-2.6786, 118.8933" (Google Maps), "-2.6786 118.8933",
 * atau link Google Maps yang berisi @lat,lng / q=lat,lng
 */
export function parseLatLng(text) {
  if (!text) return null;
  const s = String(text);
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || s.match(/(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
}

export const hasCoord = (o) => o && o.latitude !== null && o.latitude !== undefined && o.latitude !== '' && o.longitude !== null && o.longitude !== '' && !isNaN(Number(o.latitude));

export const gmapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

export const COLORS = {
  odc: '#16a34a',
  odp: '#eab308',
  active: '#2563eb',
  isolated: '#dc2626',
  pending: '#9333ea',
  other: '#64748b'
};
