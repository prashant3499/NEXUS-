'use strict';
/**
 * ondcOnboarding — scaffolding to become an ONDC Network Participant (Seller App).
 * ONDC is open protocols on the Beckn Protocol; a Network Participant needs a domain,
 * SSL, a whitelisted subscriber_id, Ed25519 signing + X25519 encryption keys, a
 * site-verification file, and Beckn API endpoints, tested staging→pre-prod→prod.
 * These helpers cover the cryptographic + checklist parts. Verify exact key FORMATS
 * against ONDC's official utility before production — this is a starter, not a
 * certified integration.
 */
const crypto = require('crypto');

/** Generate the two key pairs ONDC requires (Node's built-in crypto, per ONDC NodeJS guidance). */
function generateBecknKeys() {
  const sign = crypto.generateKeyPairSync('ed25519');
  const enc = crypto.generateKeyPairSync('x25519');
  const b64 = (k, t) => k.export({ type: t, format: 'der' }).toString('base64');
  return {
    signing: { algo: 'Ed25519', public_key: b64(sign.publicKey, 'spki'), private_key: b64(sign.privateKey, 'pkcs8') },
    encryption: { algo: 'X25519', public_key: b64(enc.publicKey, 'spki'), private_key: b64(enc.privateKey, 'pkcs8') },
    note: 'DER/base64 shown. Confirm the exact raw/ASN.1 format with the ONDC key utility before submitting.',
  };
}

/** The file ONDC fetches at https://<subscriber_id>/ondc-site-verification.html */
function siteVerificationHtml(signedRequestId) {
  const id = String(signedRequestId || 'SIGNED_UNIQUE_REQ_ID');
  return '<html><head><meta name="ondc-site-verification" content="' + id + '" /></head><body>ONDC Site Verification Page</body></html>';
}

function readinessChecklist() {
  return [
    { step: 'Register a business entity + GST + PAN + bank', status: 'todo', p: 'P0' },
    { step: 'Own a domain (FQDN) with a valid SSL certificate', status: 'todo', p: 'P0' },
    { step: 'Sign up on the ONDC Network Participant Portal', status: 'todo', p: 'P0' },
    { step: 'Generate Ed25519 signing + X25519 encryption keys', status: 'ready', p: 'P0', note: 'generateBecknKeys()' },
    { step: 'Host ondc-site-verification.html at the subscriber_id path', status: 'ready', p: 'P0', note: 'siteVerificationHtml()' },
    { step: 'Request whitelisting for subscriber_id (staging→pre-prod→prod)', status: 'todo', p: 'P0' },
    { step: 'Implement Beckn Seller APIs: on_search/on_select/on_init/on_confirm/on_status', status: 'todo', p: 'P1' },
    { step: 'Pass ONDC sandbox certification', status: 'todo', p: 'P1' },
    { step: 'Sign the ONDC Participation Agreement', status: 'todo', p: 'P1' },
    { step: 'Map NEXUS catalogue → ONDC schema (products, price, fulfilment)', status: 'partial', p: 'P1', note: 'geoOptimizer/product schema is a starting point' },
  ];
}

function participantOptions() {
  return {
    fast_path: 'List NEXUS sellers via an existing ONDC Seller App (Mystore, Zoho Vikra, SellerApp) + DigiReady self-assessment — validate quickly, no Beckn build.',
    strategic_path: 'Become a Seller Network Participant (build the Beckn integration) so NEXUS itself is discoverable across all ONDC buyer apps — more work, full control.',
    recommend: 'Start on the fast path to prove demand, then build the SNP integration once you have volume and the entity.',
  };
}

module.exports = { generateBecknKeys, siteVerificationHtml, readinessChecklist, participantOptions };
