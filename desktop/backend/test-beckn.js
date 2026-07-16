'use strict';

const B = require('./src/beckn');
const crypto = require('crypto');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Cryptographic layer — real Ed25519 sign + verify');
{
  // Generate a real Ed25519 keypair the way ONDC keys would be provisioned.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privB64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const pubB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const signer = B.makeSigner({ privateKeyB64: privB64, keyId: 'key-1' });
  a(signer.kind === 'ed25519', 'Real signer when keys provided');
  const msg = JSON.stringify({ hello: 'world' });
  const sig = signer.sign(msg);
  a(sig.signature && sig.algorithm === 'ed25519', 'Produces an Ed25519 signature');
  a(B.verifySignature(msg, sig.signature, pubB64) === true, 'Signature verifies with the public key');
  a(B.verifySignature('tampered', sig.signature, pubB64) === false, 'Tampered message fails verification');
}

sec('Mock signer (no keys) — honest fallback');
{
  const signer = B.makeSigner({});
  a(signer.kind === 'mock', 'Mock signer without keys');
  const sig = signer.sign('abc');
  a(sig.signature.startsWith('mock:'), 'Mock signature is labelled');
  a(B.verifySignature('abc', sig.signature) === true, 'Mock verifies in mock mode');
  a(B.verifySignature('xyz', sig.signature) === false, 'Mock rejects wrong message');
}

sec('Async callback correlation');
{
  const c = B.makeCorrelator();
  const ctx = B.buildContext('search', { subscriber_id: 'bap.nexus.in' });
  c.register(ctx);
  a(c.pendingCount() === 1, 'Outgoing request registered');
  // The callback arrives later as on_search with the same message_id.
  const cbCtx = { action: 'on_search', message_id: ctx.message_id, transaction_id: ctx.transaction_id };
  const r = c.receive(cbCtx, { catalog: {} });
  a(r.ok === true && r.correlated_to === 'search', 'on_search correlated to the search request');
  // A wrong callback action is rejected.
  const ctx2 = B.buildContext('select', { subscriber_id: 'bap.nexus.in' });
  c.register(ctx2);
  const bad = c.receive({ action: 'on_confirm', message_id: ctx2.message_id }, {});
  a(bad.ok === false, 'Mismatched callback action rejected');
  // Unknown callback rejected.
  a(c.receive({ action: 'on_search', message_id: 'unknown' }, {}).ok === false, 'Unknown message_id rejected');
}

sec('Protocol mapping + schema validation');
{
  const ctx = B.buildContext('search', { subscriber_id: 'bap.nexus.in', bap_uri: 'https://nexus.in' });
  a(B.REQUIRED_CONTEXT.every(k => ctx[k] !== undefined), 'buildContext fills the required envelope');
  a(ctx.core_version === '1.2.0' && ctx.country === 'IND', 'Sets Beckn version + country');
  const goodMsg = { context: ctx, message: { intent: {} } };
  a(B.validateMessage(goodMsg).length === 0, 'Valid message passes');
  const noCtx = B.validateMessage({ message: {} });
  a(noCtx.includes('missing context'), 'Missing context caught');
  const badCtx = B.validateMessage({ context: { action: 'search' }, message: {} });
  a(badCtx.some(p => /transaction_id/.test(p)), 'Missing required context fields caught');
  const noBody = B.validateMessage({ context: ctx });
  a(noBody.includes('missing message body'), 'Missing message body caught');
}

sec('Signed envelope — never publishes an invalid message');
{
  const signer = B.makeSigner({});
  const ctx = B.buildContext('search', { subscriber_id: 'bap.nexus.in' });
  const ok = B.signedEnvelope({ context: ctx, message: { intent: {} } }, signer, 'bap.nexus.in');
  a(ok.ok === true && ok.headers.Authorization.startsWith('Signature'), 'Valid message → signed envelope with auth header');
  const bad = B.signedEnvelope({ message: {} }, signer, 'bap.nexus.in');
  a(bad.ok === false && bad.problems.length > 0, 'Invalid message → refused, not signed');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
