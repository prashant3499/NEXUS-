'use strict';

/**
 * test-geo.js — the maps/geo provider seam.
 *   - Real coordinates for known places; deterministic fallback for unknown
 *   - Haversine distance is correct
 *   - Mock provider works with no network/key
 *   - Google provider activates only with a key; uses an injectable fetch
 *   - makeGeoProvider picks the right implementation
 */

const G = require('./src/geo');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Local geocoding — real coordinates');
{
  const jaipur = G.geocodeLocal('Jaipur', 'Rajasthan');
  a(Math.abs(jaipur.lat - 26.91) < 0.1 && Math.abs(jaipur.lng - 75.79) < 0.1, 'Jaipur resolves to real coordinates');
  a(jaipur.precision === 'city', 'City-level precision');
  const moradabad = G.geocodeLocal('Moradabad');
  a(Math.abs(moradabad.lat - 28.83) < 0.1, 'Moradabad resolves');
  // "City, State" string
  const compound = G.geocodeLocal('Jaipur, Rajasthan');
  a(compound.precision === 'city', 'Compound "City, State" resolves to city');
}

sec('Geocoding fallbacks');
{
  const stateFallback = G.geocodeLocal('Nowhereville', 'Kerala');
  a(stateFallback.precision === 'state', 'Unknown city falls back to its state');
  a(Math.abs(stateFallback.lat - 8.52) < 0.1, 'State fallback uses Kerala coordinates');
  const total = G.geocodeLocal('Atlantis', 'Narnia');
  a(total.precision === 'approximate', 'Fully-unknown place gets approximate coordinate');
  a(total.lat >= 8 && total.lat <= 35 && total.lng >= 68 && total.lng <= 92, 'Fallback stays inside India bounds');
  // Deterministic
  const t2 = G.geocodeLocal('Atlantis', 'Narnia');
  a(total.lat === t2.lat && total.lng === t2.lng, 'Fallback is deterministic');
}

sec('Haversine distance');
{
  const jaipur = G.geocodeLocal('Jaipur');
  const surat = G.geocodeLocal('Surat');
  const d = G.haversineKm(jaipur, surat);
  a(d > 600 && d < 800, `Jaipur→Surat ~705km (got ${d})`);
  a(G.haversineKm(jaipur, jaipur) === 0, 'Distance to self is 0');
  a(G.haversineKm(null, jaipur) === null, 'Null-safe');
}

sec('Mock provider — no network, no key');
{
  const mock = new G.MockGeoProvider();
  a(mock.kind === 'mock', 'Identifies as mock');
  return Promise.resolve().then(async () => {
    const g = await mock.geocode('Khurja', { state: 'Uttar Pradesh' });
    a(g.provider === 'mock' && g.lat, 'Mock geocode returns coordinates');
    const sm = mock.staticMap({ markers: [{ lat: 26.9, lng: 75.8 }, { lat: 28.8, lng: 78.8 }] });
    a(sm.url === null && sm.center, 'Mock static map has no URL but a real center');
    const dist = await mock.distance({ lat: 26.91, lng: 75.79 }, { lat: 21.17, lng: 72.83 });
    a(dist.distance_km > 0 && dist.duration_min > 0, 'Mock distance returns km + duration');
    runSyncTail();
  });
}

function runSyncTail() {
  sec('Google provider — activates with key, injectable fetch');
  {
    let threw = false;
    try { new G.GoogleMapsProvider({}); } catch (e) { threw = true; }
    a(threw, 'Refuses to construct without an API key');

    // Inject a fake fetch to exercise the parsing without network
    const fakeGeocodeResp = { results: [{ geometry: { location: { lat: 26.91, lng: 75.79 }, location_type: 'APPROXIMATE' }, formatted_address: 'Jaipur, Rajasthan, India', place_id: 'abc' }] };
    const provider = new G.GoogleMapsProvider({ apiKey: 'test-key', httpGetJson: async () => fakeGeocodeResp });
    provider.geocode('Jaipur').then((r) => {
      a(r.provider === 'google' && r.lat === 26.91, 'Google provider parses geocode response');
      a(r.place_id === 'abc', 'Carries place_id');
      // Static map produces a real URL with the key
      const sm = provider.staticMap({ markers: [{ lat: 26.9, lng: 75.8 }] });
      a(typeof sm.url === 'string' && sm.url.includes('staticmap') && sm.url.includes('test-key'), 'Google static map builds a real URL');
      finish();
    });
  }
}

function finish() {
  sec('makeGeoProvider factory');
  {
    const mockByDefault = G.makeGeoProvider({ googleMaps: { provider: 'mock' } });
    a(mockByDefault.kind === 'mock', 'Defaults to mock when not configured for google');
    const noKey = G.makeGeoProvider({ googleMaps: { provider: 'google', apiKey: null } });
    a(noKey.kind === 'mock', 'Falls back to mock when google selected but no key');
    const withKey = G.makeGeoProvider({ googleMaps: { provider: 'google', apiKey: 'k' } });
    a(withKey.kind === 'google', 'Uses google when configured + key present');
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
}
