'use strict';

/**
 * test-auth.js
 *
 * Tests session authentication:
 *   - Token mint + verify round-trips
 *   - Tampered tokens, bad signatures, expired tokens all rejected
 *   - SessionStore revocation
 *   - Bearer header parsing
 *   - authenticate(): bootstrap founder token + session tokens
 *   - authorize(): role gates, founder bypass
 *   - authorizeOwnership(): seller-owns-resource, founder bypass
 */

const A = require('./src/auth');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const SECRET = 'test-secret-do-not-use-in-prod';

sec('Constants');
{
  a(A.ROLES.BUYER === 'buyer' && A.ROLES.SELLER === 'seller' && A.ROLES.FOUNDER === 'founder', '3 roles');
  a(A.DEFAULT_TTL_HOURS === 24, 'Default TTL 24h');
}

sec('mintToken — basic');
{
  const { token, payload } = A.mintToken({ sub: 'seller_1', role: 'seller', sellerId: 'seller_1' }, { secret: SECRET });
  a(typeof token === 'string' && token.includes('.'), 'Token is a dotted string');
  a(payload.sub === 'seller_1' && payload.role === 'seller', 'Payload carries claims');
  a(payload.sellerId === 'seller_1', 'sellerId bound');
  a(payload.exp > payload.iat, 'exp after iat');
}

sec('mintToken — validation');
{
  let threw = 0;
  try { A.mintToken({ sub: 'x', role: 'seller' }, {}); } catch (e) { threw++; }      // no secret
  try { A.mintToken({ role: 'seller' }, { secret: SECRET }); } catch (e) { threw++; } // no sub
  try { A.mintToken({ sub: 'x', role: 'wizard' }, { secret: SECRET }); } catch (e) { threw++; } // bad role
  a(threw === 3, 'Rejects missing secret, missing sub, invalid role');
}

sec('verifyToken — happy path');
{
  const { token } = A.mintToken({ sub: 'founder', role: 'founder' }, { secret: SECRET });
  const v = A.verifyToken(token, { secret: SECRET });
  a(v.ok === true, 'Valid token verifies');
  a(v.payload.role === 'founder', 'Payload recovered');
}

sec('verifyToken — tampering rejected');
{
  const { token } = A.mintToken({ sub: 'seller_1', role: 'seller', sellerId: 'seller_1' }, { secret: SECRET });
  const [enc, sig] = token.split('.');
  // Tamper the payload to claim founder role
  const forgedPayload = Buffer.from(JSON.stringify({ sub: 'seller_1', role: 'founder', sellerId: null, iat: Date.now(), exp: Date.now() + 1e9 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const forged = `${forgedPayload}.${sig}`;
  const v = A.verifyToken(forged, { secret: SECRET });
  a(v.ok === false && v.error === 'bad_signature', 'Forged payload → bad_signature');
}

sec('verifyToken — wrong secret rejected');
{
  const { token } = A.mintToken({ sub: 'x', role: 'buyer' }, { secret: SECRET });
  const v = A.verifyToken(token, { secret: 'different-secret' });
  a(v.ok === false && v.error === 'bad_signature', 'Wrong secret → bad_signature');
}

sec('verifyToken — expiry');
{
  const past = Date.now() - 1000;
  const { token } = A.mintToken({ sub: 'x', role: 'buyer' }, { secret: SECRET, ttlHours: 0.0001, now: past });
  const v = A.verifyToken(token, { secret: SECRET });
  a(v.ok === false && v.error === 'expired', 'Expired token rejected');
}

sec('verifyToken — malformed');
{
  a(A.verifyToken('notadottedstring', { secret: SECRET }).error === 'malformed_token', 'No dot → malformed');
  a(A.verifyToken('', { secret: SECRET }).error === 'malformed_token', 'Empty → malformed');
  a(A.verifyToken('.', { secret: SECRET }).error === 'malformed_token', 'Just a dot → malformed');
  a(A.verifyToken('!!!.@@@', { secret: SECRET }).ok === false, 'Garbage → rejected');
}

sec('SessionStore — record + isActive');
{
  let now = Date.now();
  const store = new A.SessionStore({ now: () => now });
  const { payload } = A.mintToken({ sub: 'seller_1', role: 'seller' }, { secret: SECRET, now });
  const sid = 'seller_1:' + payload.iat;
  store.record(sid, payload);
  a(store.isActive(sid) === true, 'Recorded session is active');
  a(store.isActive('nonexistent') === false, 'Unknown session not active');
}

sec('SessionStore — revoke');
{
  const store = new A.SessionStore();
  const { payload } = A.mintToken({ sub: 's2', role: 'seller' }, { secret: SECRET });
  const sid = 's2:' + payload.iat;
  store.record(sid, payload);
  a(store.revoke(sid) === true, 'Revoke succeeds');
  a(store.isActive(sid) === false, 'Revoked session inactive');
  a(store.revoke('nope') === false, 'Revoking unknown returns false');
}

sec('SessionStore — revokeAllForSubject');
{
  const store = new A.SessionStore();
  for (let i = 0; i < 3; i++) {
    const { payload } = A.mintToken({ sub: 's3', role: 'seller' }, { secret: SECRET, now: Date.now() + i });
    store.record('s3:' + payload.iat, payload);
  }
  const { payload: other } = A.mintToken({ sub: 's4', role: 'seller' }, { secret: SECRET });
  store.record('s4:' + other.iat, other);
  const n = store.revokeAllForSubject('s3');
  a(n === 3, 'Revoked all 3 sessions for s3');
  a(store.isActive('s4:' + other.iat) === true, 's4 unaffected');
}

sec('SessionStore — sweepExpired + activeCount');
{
  let now = Date.now();
  const store = new A.SessionStore({ now: () => now });
  const { payload: live } = A.mintToken({ sub: 'live', role: 'buyer' }, { secret: SECRET, now });
  store.record('live:' + live.iat, live);
  const { payload: dead } = A.mintToken({ sub: 'dead', role: 'buyer' }, { secret: SECRET, ttlHours: 0.0001, now: now - 1000 });
  store.record('dead:' + dead.iat, dead);
  a(store.activeCount() === 1, 'Only 1 active (dead expired)');
  const swept = store.sweepExpired();
  a(swept === 1, 'Swept 1 expired');
}

sec('bearerFromHeader');
{
  a(A.bearerFromHeader('Bearer abc123') === 'abc123', 'Extracts token');
  a(A.bearerFromHeader('bearer xyz') === 'xyz', 'Case-insensitive');
  a(A.bearerFromHeader('Basic abc') === null, 'Rejects non-bearer');
  a(A.bearerFromHeader(null) === null, 'Null safe');
  a(A.bearerFromHeader('') === null, 'Empty safe');
}

sec('authenticate — session token');
{
  const { token } = A.mintToken({ sub: 'seller_9', role: 'seller', sellerId: 'seller_9' }, { secret: SECRET });
  const r = A.authenticate({ authHeader: 'Bearer ' + token, secret: SECRET });
  a(r.ok === true, 'Valid bearer authenticates');
  a(r.principal.role === 'seller' && r.principal.sellerId === 'seller_9', 'Principal carries role + sellerId');
}

sec('authenticate — no token');
{
  const r = A.authenticate({ authHeader: undefined, secret: SECRET });
  a(r.ok === false && r.status === 401, 'No token → 401');
}

sec('authenticate — bootstrap founder token');
{
  const FOUNDER = 'super-secret-founder-bootstrap-token';
  const r = A.authenticate({ authHeader: 'Bearer ' + FOUNDER, secret: SECRET, founderToken: FOUNDER });
  a(r.ok === true && r.principal.role === 'founder', 'Bootstrap founder token works');
  a(r.principal.bootstrap === true, 'Marked as bootstrap');
  // Wrong founder token falls through to normal verification (and fails)
  const r2 = A.authenticate({ authHeader: 'Bearer wrong-token-entirely', secret: SECRET, founderToken: FOUNDER });
  a(r2.ok === false, 'Wrong founder token rejected');
}

sec('authenticate — revoked session rejected');
{
  let now = Date.now();
  const store = new A.SessionStore({ now: () => now });
  const { token, payload } = A.mintToken({ sub: 'seller_r', role: 'seller', sellerId: 'seller_r' }, { secret: SECRET, now });
  const sid = 'seller_r:' + payload.iat;
  store.record(sid, payload);
  // Active first
  let r = A.authenticate({ authHeader: 'Bearer ' + token, secret: SECRET, store, now });
  a(r.ok === true, 'Active session authenticates');
  // Revoke → reject
  store.revoke(sid);
  r = A.authenticate({ authHeader: 'Bearer ' + token, secret: SECRET, store, now });
  a(r.ok === false && r.error === 'revoked', 'Revoked session → rejected');
}

sec('authorize — role gates');
{
  const founder = { sub: 'founder', role: 'founder' };
  const seller = { sub: 's', role: 'seller', sellerId: 's' };
  const buyer = { sub: 'b', role: 'buyer' };
  a(A.authorize(founder, 'founder').ok === true, 'Founder → founder route OK');
  a(A.authorize(founder, 'seller').ok === true, 'Founder bypasses seller gate (full control)');
  a(A.authorize(seller, 'seller').ok === true, 'Seller → seller route OK');
  a(A.authorize(seller, 'founder').ok === false, 'Seller → founder route forbidden');
  a(A.authorize(seller, 'founder').status === 403, 'Forbidden is 403');
  a(A.authorize(buyer, 'seller').ok === false, 'Buyer → seller route forbidden');
  a(A.authorize(null, 'seller').ok === false && A.authorize(null, 'seller').status === 401, 'No principal → 401');
}

sec('authorizeOwnership — seller owns resource');
{
  const seller1 = { sub: 's1', role: 'seller', sellerId: 's1' };
  const seller2 = { sub: 's2', role: 'seller', sellerId: 's2' };
  const founder = { sub: 'founder', role: 'founder' };
  a(A.authorizeOwnership(seller1, 's1').ok === true, 'Seller acts on own resource');
  a(A.authorizeOwnership(seller1, 's2').ok === false, 'Seller cannot act on another seller resource');
  a(A.authorizeOwnership(seller1, 's2').error === 'forbidden_not_owner', 'Clear ownership error');
  a(A.authorizeOwnership(founder, 's2').ok === true, 'Founder acts on any resource');
  a(A.authorizeOwnership(null, 's1').status === 401, 'No principal → 401');
}

sec('Co-founder role + financial visibility');
{
  a(A.ROLES.COFOUNDER === 'cofounder', 'COFOUNDER role exists');
  const founder = { sub: 'f', role: 'founder' };
  const cofounder = { sub: 'c', role: 'cofounder' };
  const seller = { sub: 's', role: 'seller', sellerId: 's' };
  const buyer = { sub: 'b', role: 'buyer' };
  a(A.canSeeFinancials(founder) === true, 'Founder sees financials');
  a(A.canSeeFinancials(cofounder) === true, 'Co-founder sees financials');
  a(A.canSeeFinancials(seller) === false, 'Seller CANNOT see financials');
  a(A.canSeeFinancials(buyer) === false, 'Buyer CANNOT see financials');
  a(A.canSeeFinancials(null) === false, 'Null principal cannot see financials');
  // Co-founder is a privileged operator
  a(A.authorize(cofounder, 'founder').ok === true, 'Co-founder satisfies founder-level checks');
  a(A.authorizeOwnership(cofounder, 'any_seller').ok === true, 'Co-founder bypasses ownership');
}

sec('Security — seller cannot self-elevate to founder');
{
  // The whole point: a seller's token must never grant founder powers.
  const { token } = A.mintToken({ sub: 'attacker', role: 'seller', sellerId: 'attacker' }, { secret: SECRET });
  const r = A.authenticate({ authHeader: 'Bearer ' + token, secret: SECRET });
  a(r.ok === true, 'Seller token authenticates as seller');
  a(A.authorize(r.principal, 'founder').ok === false, 'But CANNOT access founder routes');
  a(r.principal.role === 'seller', 'Role stays seller');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
