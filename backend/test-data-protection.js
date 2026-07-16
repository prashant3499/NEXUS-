'use strict';

const D = require('./src/dataProtection');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const KEY = 'a'.repeat(64); // 32-byte hex key for tests

sec('AES-256-GCM field encryption round-trips');
{
  const aadhaar = '2341 2341 2346';
  const enc = D.encryptField(aadhaar, KEY);
  a(enc !== aadhaar && enc.startsWith('v1:'), 'Encrypts to versioned ciphertext (not plaintext)');
  a(D.decryptField(enc, KEY) === aadhaar, 'Decrypts back to the original');
  a(D.encryptField(aadhaar, KEY) !== D.encryptField(aadhaar, KEY), 'Random IV → different ciphertext each time');
  a(D.encryptField(null, KEY) === null, 'Null passes through');
}

sec('Tamper + wrong-key are detected (authenticated encryption)');
{
  const enc = D.encryptField('PAN: ABCDE1234F', KEY);
  let threw = false;
  try { D.decryptField(enc, 'b'.repeat(64)); } catch (e) { threw = true; }
  a(threw, 'Wrong key → throws (no silent garbage)');
  // tamper the ciphertext
  const parts = enc.split(':'); parts[3] = Buffer.from('tampered').toString('base64');
  let threw2 = false;
  try { D.decryptField(parts.join(':'), KEY); } catch (e) { threw2 = true; }
  a(threw2, 'Tampered ciphertext → throws (GCM auth tag fails)');
}

sec('PII masking never reveals the secret');
{
  a(D.maskPII('2341 2341 2346', 'aadhaar') === 'XXXX XXXX 2346', 'Aadhaar shows only last 4');
  a(/^XXXXX/.test(D.maskPII('ABCDE1234F', 'pan')), 'PAN masked');
  a(/2346$/.test(D.maskPII('50100123452346', 'bank')), 'Bank shows only last 4');
  a(/3210$/.test(D.maskPII('9876543210', 'phone')), 'Phone shows only last 4');
  a(!D.maskPII('2341 2341 2346', 'aadhaar').includes('2341'), 'Full Aadhaar never appears in the mask');
}

sec('Integrity seals for citizen\u2194government payloads (C2G / G2C)');
{
  const payload = { scheme: 'pm_vishwakarma', artisan: 'A123', approved: true, amount: 15000 };
  const seal = D.integritySeal(payload, KEY);
  a(typeof seal === 'string' && seal.length > 0, 'Produces a seal');
  a(D.verifySeal(payload, seal, KEY) === true, 'Verifies an untampered payload');
  const tampered = { ...payload, amount: 150000 };
  a(D.verifySeal(tampered, seal, KEY) === false, 'Detects a tampered amount (G2C benefit cannot be altered)');
  a(D.verifySeal(payload, seal, 'c'.repeat(64)) === false, 'Wrong key → fails');
}

sec('Production refuses weak keys (works with productionGuard)');
{
  a(D.validateKey('dev', { production: true }).ok === false, 'Dev key refused in production');
  a(D.validateKey('short', { production: true }).ok === false, 'Short key refused');
  a(D.validateKey(KEY, { production: true }).ok === true, 'Strong key accepted');
  a(D.validateKey('dev', { production: false }).ok === true, 'Dev key fine outside production');
}

sec('Security posture summary');
{
  const p = D.securityPosture();
  a(/AES-256-GCM/.test(p.at_rest), 'Documents at-rest encryption');
  a(/Ed25519|HMAC/.test(p.signing), 'Documents signing layers');
  a(/integrity/i.test(p.integrity_c2g_g2c), 'Documents C2G/G2C integrity');
  a(/DPDP/.test(p.consent), 'Documents DPDP consent');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
