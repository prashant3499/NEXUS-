'use strict';

/**
 * auth.js
 *
 * Session authentication for NEXUS. Dependency-free — uses only Node's
 * built-in crypto, matching the rest of the codebase (no JWT library).
 *
 * The model maps to the three roles the platform already has:
 *   - buyer   — anonymous is allowed for browsing + placing orders; a buyer
 *               MAY hold a session (phone-verified) to see "my orders".
 *   - seller  — must hold a session bound to their seller_id; can only act
 *               on their OWN products/orders.
 *   - founder — the human-in-the-loop. Full control. Bootstrapped from a
 *               server-side secret (FOUNDER_TOKEN env), since there is exactly
 *               one founder and they predate any signup flow.
 *
 * Token format (compact, signed, stateless-verifiable):
 *
 *     base64url(payloadJSON) + "." + base64url(hmacSHA256(payloadJSON, secret))
 *
 * The payload carries { sub, role, sellerId?, iat, exp }. Verification
 * recomputes the HMAC and checks expiry — no DB lookup needed for the happy
 * path. A SessionStore is also kept so sessions can be explicitly revoked
 * (logout, security events) and so we can list active sessions.
 *
 * Why HMAC and not a real JWT lib: zero dependencies, full control, and the
 * threat model here (single founder, phone-verified sellers, MoR platform)
 * doesn't need asymmetric keys. The secret lives in env (AUTH_SECRET).
 */

const crypto = require('crypto');

const ROLES = Object.freeze({ BUYER: 'buyer', SELLER: 'seller', FOUNDER: 'founder', COFOUNDER: 'cofounder' });

const DEFAULT_TTL_HOURS = 24;

/**
 * Roles allowed to see actual costs, expenses, margins, and platform P&L.
 * Only the founder and co-founder know the real numbers — sellers and buyers
 * never see cost-to-serve, inference cost, or platform margin.
 */
const FINANCIAL_ROLES = Object.freeze(['founder', 'cofounder']);
function canSeeFinancials(principal) {
  return !!principal && FINANCIAL_ROLES.includes(principal.role);
}

// ════════════════════════════════════════════════════════════
// TOKEN MINT / VERIFY
// ════════════════════════════════════════════════════════════

function _b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

function _sign(payloadStr, secret) {
  return _b64url(crypto.createHmac('sha256', secret).update(payloadStr).digest());
}

/**
 * Mint a signed session token.
 * @param {object} claims — { sub, role, sellerId? }
 * @param {object} opts   — { secret, ttlHours?, now? }
 * @returns {object} { token, payload }
 */
function mintToken(claims, opts = {}) {
  if (!opts.secret) throw new Error('mintToken requires opts.secret');
  if (!claims || !claims.sub || !claims.role) throw new Error('mintToken requires sub + role');
  if (!Object.values(ROLES).includes(claims.role)) throw new Error('invalid role: ' + claims.role);

  const now = opts.now || Date.now();
  const ttlMs = (opts.ttlHours || DEFAULT_TTL_HOURS) * 3600 * 1000;
  const payload = {
    sub: claims.sub,
    role: claims.role,
    sellerId: claims.sellerId || null,
    iat: now,
    exp: now + ttlMs,
  };
  const payloadStr = JSON.stringify(payload);
  const encoded = _b64url(payloadStr);
  const sig = _sign(payloadStr, opts.secret);
  return { token: `${encoded}.${sig}`, payload };
}

/**
 * Verify a token's signature + expiry. Pure — does not consult the store.
 * @returns {object} { ok, payload? , error? }
 */
function verifyToken(token, opts = {}) {
  if (!opts.secret) throw new Error('verifyToken requires opts.secret');
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, error: 'malformed_token' };
  }
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return { ok: false, error: 'malformed_token' };

  let payloadStr;
  try {
    payloadStr = _b64urlDecode(encoded);
  } catch (e) {
    return { ok: false, error: 'malformed_token' };
  }

  const expectedSig = _sign(payloadStr, opts.secret);
  // Constant-time comparison to avoid timing attacks
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'bad_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch (e) {
    return { ok: false, error: 'malformed_payload' };
  }

  const now = opts.now || Date.now();
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    return { ok: false, error: 'expired' };
  }

  return { ok: true, payload };
}

// ════════════════════════════════════════════════════════════
// SESSION STORE — for revocation + listing
// ════════════════════════════════════════════════════════════

/**
 * Tracks issued sessions so they can be revoked (logout) and audited.
 * Verification still works statelessly via HMAC, but a revoked session id
 * is rejected even if the token signature is valid and unexpired.
 */
class SessionStore {
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now());
    // sessionId → { sub, role, sellerId, iat, exp, revoked }
    this._sessions = new Map();
  }

  /** Record a freshly minted session. */
  record(sessionId, payload) {
    this._sessions.set(sessionId, { ...payload, revoked: false });
    return sessionId;
  }

  /** Is this session id still valid (exists, not revoked, not expired)? */
  isActive(sessionId) {
    const s = this._sessions.get(sessionId);
    if (!s) return false;
    if (s.revoked) return false;
    if (s.exp < this.now()) return false;
    return true;
  }

  revoke(sessionId) {
    const s = this._sessions.get(sessionId);
    if (s) { s.revoked = true; return true; }
    return false;
  }

  /** Revoke every session for a subject (e.g. seller compromised). */
  revokeAllForSubject(sub) {
    let n = 0;
    for (const s of this._sessions.values()) {
      if (s.sub === sub && !s.revoked) { s.revoked = true; n++; }
    }
    return n;
  }

  /** Drop expired sessions to bound memory. */
  sweepExpired() {
    const now = this.now();
    let n = 0;
    for (const [id, s] of this._sessions.entries()) {
      if (s.exp < now) { this._sessions.delete(id); n++; }
    }
    return n;
  }

  activeCount() {
    const now = this.now();
    let n = 0;
    for (const s of this._sessions.values()) {
      if (!s.revoked && s.exp >= now) n++;
    }
    return n;
  }
}

// ════════════════════════════════════════════════════════════
// AUTHORIZATION HELPERS
// ════════════════════════════════════════════════════════════

/** Extract a bearer token from an Authorization header value. */
function bearerFromHeader(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const m = headerValue.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Authenticate a request. Returns { ok, principal?, error?, status? }.
 *
 * @param {object} args
 * @param {string} args.authHeader  — raw Authorization header
 * @param {string} args.secret      — HMAC secret
 * @param {string} [args.founderToken] — bootstrap founder secret (env)
 * @param {SessionStore} [args.store] — optional revocation store
 * @param {number} [args.now]
 *
 * The founder can authenticate two ways: (a) a normal session token with
 * role=founder, or (b) the raw bootstrap FOUNDER_TOKEN passed as bearer
 * (so the founder can act before any session machinery exists).
 */
function authenticate(args) {
  const { authHeader, secret, founderToken, cofounderToken, store, now } = args;
  const token = bearerFromHeader(authHeader);
  if (!token) return { ok: false, error: 'no_token', status: 401 };

  // Bootstrap founder token — constant-time compare
  if (founderToken && token.length === founderToken.length) {
    const a = Buffer.from(token), b = Buffer.from(founderToken);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { ok: true, principal: { sub: 'founder', role: ROLES.FOUNDER, sellerId: null, bootstrap: true } };
    }
  }

  // Bootstrap co-founder token — same mechanism, financial visibility, but a
  // distinct principal so the audit trail can tell founder from co-founder.
  if (cofounderToken && token.length === cofounderToken.length) {
    const a = Buffer.from(token), b = Buffer.from(cofounderToken);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { ok: true, principal: { sub: 'cofounder', role: ROLES.COFOUNDER, sellerId: null, bootstrap: true } };
    }
  }

  const v = verifyToken(token, { secret, now });
  if (!v.ok) return { ok: false, error: v.error, status: 401 };

  // If a store is supplied, honor revocation
  if (store && v.payload.sub) {
    const sessionId = v.payload.sub + ':' + v.payload.iat;
    if (store._sessions.has(sessionId) && !store.isActive(sessionId)) {
      return { ok: false, error: 'revoked', status: 401 };
    }
  }

  return { ok: true, principal: v.payload };
}

/**
 * Authorize a principal for a required role. Founder passes every check
 * (full control). Returns { ok, error?, status? }.
 */
function authorize(principal, requiredRole) {
  if (!principal) return { ok: false, error: 'not_authenticated', status: 401 };
  // Founder + co-founder are privileged operators with full access. Where a
  // decision must be founder-ONLY (e.g. pricing), the route checks the role
  // directly rather than relying on this helper.
  if (principal.role === ROLES.FOUNDER || principal.role === ROLES.COFOUNDER) return { ok: true };
  if (requiredRole && principal.role !== requiredRole) {
    return { ok: false, error: 'forbidden', status: 403 };
  }
  return { ok: true };
}

/**
 * Ownership check: a seller may only act on resources bound to their own
 * seller_id. Founder + co-founder bypass. Returns { ok, error?, status? }.
 */
function authorizeOwnership(principal, resourceSellerId) {
  if (!principal) return { ok: false, error: 'not_authenticated', status: 401 };
  if (principal.role === ROLES.FOUNDER || principal.role === ROLES.COFOUNDER) return { ok: true };
  if (principal.role === ROLES.SELLER && principal.sellerId === resourceSellerId) return { ok: true };
  return { ok: false, error: 'forbidden_not_owner', status: 403 };
}

module.exports = {
  ROLES,
  FINANCIAL_ROLES,
  DEFAULT_TTL_HOURS,
  mintToken,
  verifyToken,
  SessionStore,
  bearerFromHeader,
  authenticate,
  authorize,
  authorizeOwnership,
  canSeeFinancials,
};
