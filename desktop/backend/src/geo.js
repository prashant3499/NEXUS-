'use strict';

/**
 * geo.js — the maps / geolocation seam.
 *
 * Maps touch three parts of the platform:
 *   1. Tourism   — plot experiences, hotels, event venues; build itineraries;
 *                  estimate travel time between stops.
 *   2. Supply    — map the craft + industrial clusters so the founder sees the
 *                  supply universe geographically.
 *   3. Logistics — geocode shipping origin/destination for distance + ETA.
 *
 * Same architecture as payments: a provider INTERFACE with two implementations.
 *   - MockGeoProvider   — deterministic, dependency-free, real coordinates for
 *                         India's states + the craft cities in our data. Runs in
 *                         dev/test with NO network and NO API key.
 *   - GoogleMapsProvider — calls the Google Maps Platform APIs (Geocoding,
 *                         Places, Distance Matrix, Static Maps). Activates only
 *                         when GOOGLE_MAPS_API_KEY is set. Structurally complete;
 *                         flips live with the key — no engine changes.
 *
 * makeGeoProvider(config, MockGeoProvider) picks the right one, mirroring
 * razorpayProvider.makeProvider.
 */

// ── Real coordinates for the places in our data (states + craft cities). ──
// Authentic lat/lng so the mock provider returns truthful map positions without
// any network call. Keys are lowercased place names.
const PLACE_COORDS = Object.freeze({
  // States / UTs (capital or centroid)
  'uttar pradesh': { lat: 26.85, lng: 80.91 },
  'rajasthan': { lat: 26.91, lng: 75.79 },
  'gujarat': { lat: 23.02, lng: 72.57 },
  'tamil nadu': { lat: 13.08, lng: 80.27 },
  'punjab': { lat: 30.73, lng: 76.78 },
  'haryana': { lat: 29.06, lng: 76.08 },
  'karnataka': { lat: 12.97, lng: 77.59 },
  'maharashtra': { lat: 19.07, lng: 72.87 },
  'jammu and kashmir': { lat: 34.08, lng: 74.80 },
  'telangana': { lat: 17.38, lng: 78.48 },
  'kerala': { lat: 8.52, lng: 76.93 },
  'assam': { lat: 26.14, lng: 91.73 },
  'madhya pradesh': { lat: 23.25, lng: 77.41 },
  'himachal pradesh': { lat: 31.10, lng: 77.17 },
  'west bengal': { lat: 22.57, lng: 88.36 },
  'bihar': { lat: 25.59, lng: 85.13 },
  'odisha': { lat: 20.27, lng: 85.84 },
  'andhra pradesh': { lat: 16.51, lng: 80.65 },
  // Craft / industrial cities (cluster regions)
  'moradabad': { lat: 28.83, lng: 78.77 },
  'jaipur': { lat: 26.91, lng: 75.79 },
  'thanjavur': { lat: 10.79, lng: 79.14 },
  'firozabad': { lat: 27.16, lng: 78.40 },
  'khurja': { lat: 28.25, lng: 77.85 },
  'morbi': { lat: 22.81, lng: 70.83 },
  'saharanpur': { lat: 29.97, lng: 77.55 },
  'jodhpur': { lat: 26.24, lng: 73.02 },
  'channapatna': { lat: 12.65, lng: 77.21 },
  'nagina': { lat: 29.44, lng: 78.43 },
  'agra': { lat: 27.18, lng: 78.01 },
  'kanpur': { lat: 26.45, lng: 80.33 },
  'kolhapur': { lat: 16.70, lng: 74.24 },
  'tirupur': { lat: 11.11, lng: 77.34 },
  'ludhiana': { lat: 30.90, lng: 75.85 },
  'panipat': { lat: 29.39, lng: 76.97 },
  'kutch': { lat: 23.24, lng: 69.67 },
  'surat': { lat: 21.17, lng: 72.83 },
  'rajkot': { lat: 22.30, lng: 70.80 },
  'jalandhar': { lat: 31.33, lng: 75.58 },
  'meerut': { lat: 28.98, lng: 77.71 },
  'aligarh': { lat: 27.88, lng: 78.08 },
  'kannauj': { lat: 27.05, lng: 79.92 },
  'varanasi': { lat: 25.32, lng: 82.97 },
  'bhagalpur': { lat: 25.24, lng: 86.98 },
  'chanderi': { lat: 24.71, lng: 78.14 },
  'kanchipuram': { lat: 12.83, lng: 79.70 },
  'srinagar': { lat: 34.08, lng: 74.80 },
  'kashmir': { lat: 34.08, lng: 74.80 },
  'kullu': { lat: 31.96, lng: 77.11 },
  'maheshwar': { lat: 22.18, lng: 75.59 },
  'idukki': { lat: 9.85, lng: 76.97 },
});

// India bounding box, for a deterministic-but-plausible fallback.
const INDIA_BOUNDS = Object.freeze({ minLat: 8.0, maxLat: 35.0, minLng: 68.0, maxLng: 92.0 });

/** Deterministic pseudo-coordinate inside India for an unknown place name. */
function _fallbackCoord(name) {
  let h = 0;
  const s = String(name || 'india');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const lat = INDIA_BOUNDS.minLat + (h % 1000) / 1000 * (INDIA_BOUNDS.maxLat - INDIA_BOUNDS.minLat);
  const lng = INDIA_BOUNDS.minLng + ((h >> 10) % 1000) / 1000 * (INDIA_BOUNDS.maxLng - INDIA_BOUNDS.minLng);
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

/** Local geocode against the curated table; falls back to state, then India. */
function geocodeLocal(place, state) {
  const p = String(place || '').toLowerCase().trim();
  if (PLACE_COORDS[p]) return { ...PLACE_COORDS[p], resolved: p, precision: 'city' };
  // Try a contained city name (e.g. "Jaipur, Rajasthan")
  for (const key of Object.keys(PLACE_COORDS)) {
    if (p.includes(key)) return { ...PLACE_COORDS[key], resolved: key, precision: 'city' };
  }
  const s = String(state || '').toLowerCase().trim();
  if (PLACE_COORDS[s]) return { ...PLACE_COORDS[s], resolved: s, precision: 'state' };
  return { ..._fallbackCoord(p || s), resolved: p || s || 'india', precision: 'approximate' };
}

/** Great-circle distance in km between two {lat,lng} points. */
function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

// ════════════════════════════════════════════════════════════
// MOCK PROVIDER — dev/test, no network, real coordinates
// ════════════════════════════════════════════════════════════
class MockGeoProvider {
  constructor() { this.kind = 'mock'; }

  async geocode(place, opts = {}) {
    const c = geocodeLocal(place, opts.state);
    return { ...c, provider: 'mock', query: place };
  }

  /** A static-map descriptor the client can render (no key → placeholder). */
  staticMap({ markers = [], zoom = 5, size = '640x400' } = {}) {
    const center = markers.length
      ? { lat: avg(markers.map((m) => m.lat)), lng: avg(markers.map((m) => m.lng)) }
      : { lat: 22.5, lng: 79.0 };
    return { provider: 'mock', center, zoom, size, markers, url: null,
      note: 'Set GOOGLE_MAPS_API_KEY to render a real map image; coordinates are live.' };
  }

  async distance(a, b) {
    const km = haversineKm(a, b);
    return { provider: 'mock', distance_km: km, duration_min: km == null ? null : Math.round((km / 40) * 60) };
  }
}
function avg(xs) { return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000 : 0; }

// ════════════════════════════════════════════════════════════
// GOOGLE MAPS PROVIDER — live seam (activates with API key)
// ════════════════════════════════════════════════════════════
/**
 * Implements the same interface against the Google Maps Platform REST APIs.
 * Uses an injectable httpGetJson so it can be unit-tested with a stub; in
 * production it defaults to Node's https. Requires GOOGLE_MAPS_API_KEY.
 */
class GoogleMapsProvider {
  constructor({ apiKey, httpGetJson } = {}) {
    if (!apiKey) throw new Error('GoogleMapsProvider requires apiKey');
    this.apiKey = apiKey;
    this.kind = 'google';
    this._get = httpGetJson || _defaultHttpGetJson;
  }

  async geocode(place, opts = {}) {
    const q = encodeURIComponent(opts.state ? `${place}, ${opts.state}, India` : `${place}, India`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&region=in&key=${this.apiKey}`;
    const data = await this._get(url);
    const r = data && data.results && data.results[0];
    if (!r) return { lat: null, lng: null, resolved: place, precision: 'none', provider: 'google', query: place };
    return {
      lat: r.geometry.location.lat, lng: r.geometry.location.lng,
      resolved: r.formatted_address, precision: r.geometry.location_type || 'unknown',
      place_id: r.place_id, provider: 'google', query: place,
    };
  }

  staticMap({ markers = [], zoom = 5, size = '640x400' } = {}) {
    const m = markers.map((mk) => `markers=color:0x${(mk.color || 'B8410E')}|${mk.lat},${mk.lng}`).join('&');
    const center = markers.length ? '' : 'center=22.5,79.0&';
    const url = `https://maps.googleapis.com/maps/api/staticmap?${center}zoom=${zoom}&size=${size}&${m}&key=${this.apiKey}`;
    return { provider: 'google', url, zoom, size, markers };
  }

  async distance(a, b) {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${a.lat},${a.lng}&destinations=${b.lat},${b.lng}&key=${this.apiKey}`;
    const data = await this._get(url);
    const el = data && data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0];
    if (!el || el.status !== 'OK') return { provider: 'google', distance_km: null, duration_min: null };
    return { provider: 'google', distance_km: Math.round(el.distance.value / 100) / 10, duration_min: Math.round(el.duration.value / 60) };
  }
}

/** Default https GET → JSON (only used when actually live). */
function _defaultHttpGetJson(url) {
  return new Promise((resolve, reject) => {
    let https;
    try { https = require('https'); } catch (e) { return reject(e); }
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/**
 * Factory — Google Maps when configured + key present, else Mock.
 * Mirrors razorpayProvider.makeProvider.
 */
function makeGeoProvider(config = {}, Mock = MockGeoProvider) {
  const g = (config && config.googleMaps) || {};
  if (g.provider === 'google' && g.apiKey) {
    try { return new GoogleMapsProvider({ apiKey: g.apiKey }); }
    catch (e) { return new Mock(); }
  }
  return new Mock();
}

module.exports = {
  PLACE_COORDS,
  geocodeLocal,
  haversineKm,
  MockGeoProvider,
  GoogleMapsProvider,
  makeGeoProvider,
};
