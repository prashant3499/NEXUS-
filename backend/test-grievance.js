'use strict';
const G = require('./src/grievance');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');
const NOW = 1750000000000;
const HOUR = 3600 * 1000;
const DAY  = 24 * HOUR;

// ────────────────────────────────────────────────────────────
sec('FILING — happy path');
{
  const g = G.fileGrievance({
    complainantName: 'Sophie Hall', complainantContact: 'sophie@example.com',
    type: G.TYPE.PRODUCT_ISSUE, severity: G.SEVERITY.MED,
    description: 'Vase arrived chipped at the rim',
    relatedOrderId: 'ord_3', now: NOW,
  });
  a(g.id.startsWith('griev_'),              'Has a structured id');
  a(g.status === G.STATUS.OPEN,             'Initial status is open');
  a(g.slaAckBy === NOW + 24 * HOUR,         'Ack SLA = 24h (strictest of CPA/IT Rules)');
  a(g.slaResolveBy === NOW + 15 * DAY,      'Resolve SLA = 15d');
  a(g.history.length === 1,                 'History records the filing');
  a(g.history[0].action === 'filed',        'History entry action is "filed"');
  a(Object.isFrozen(g),                     'Grievance object is immutable');
  a(Object.isFrozen(g.history),             'History array is immutable');
}

// ────────────────────────────────────────────────────────────
sec('FILING — input validation');
{
  let threw = false; try { G.fileGrievance({ complainantContact: 'x@y.z', description: 'long enough now' }); } catch (e) { threw = true; }
  a(threw, 'Rejects missing complainant name');

  threw = false; try { G.fileGrievance({ complainantName: 'A', complainantContact: 'x@y.z', description: 'short' }); } catch (e) { threw = true; }
  a(threw, 'Rejects description under 10 chars');
}

// ────────────────────────────────────────────────────────────
sec('TRANSITIONS — acknowledge, progress, resolve');
{
  let g = G.fileGrievance({
    complainantName: 'A', complainantContact: 'a@b.c',
    description: 'Order never arrived', now: NOW,
  });
  g = G.acknowledge(g, 'officer_grievance', 'Ack within SLA', NOW + HOUR);
  a(g.status === G.STATUS.ACKNOWLEDGED, 'Status moves to acknowledged');
  a(g.acknowledgedAt === NOW + HOUR,    'Ack timestamp recorded');
  a(g.history.length === 2,             'History grew by one');

  g = G.progress(g, 'officer_grievance', 'Contacting logistics partner', NOW + 2*HOUR);
  a(g.status === G.STATUS.IN_PROGRESS,  'Status moves to in_progress');

  g = G.resolve(g, 'officer_grievance', 'Reshipped item; tracking shared with buyer', NOW + 3*DAY);
  a(g.status === G.STATUS.RESOLVED,     'Status moves to resolved');
  a(g.resolution.length > 10,           'Resolution stored');
  a(g.resolvedAt === NOW + 3*DAY,       'Resolve timestamp recorded');
  a(g.history.length === 4,             'History captured all transitions');
}

// ────────────────────────────────────────────────────────────
sec('TRANSITIONS — invalid states throw');
{
  let g = G.fileGrievance({ complainantName: 'A', complainantContact: 'a@b.c', description: 'description here ok', now: NOW });
  g = G.acknowledge(g, 'off', 'note', NOW + HOUR);
  let threw = false;
  try { G.acknowledge(g, 'off', 'note', NOW + 2*HOUR); } catch (e) { threw = true; }
  a(threw, 'Cannot acknowledge twice');

  g = G.resolve(g, 'off', 'resolution text long enough', NOW + 2*HOUR);
  threw = false;
  try { G.resolve(g, 'off', 'another resolution', NOW + 3*HOUR); } catch (e) { threw = true; }
  a(threw, 'Cannot resolve a resolved grievance');

  threw = false;
  try { G.resolve(G.fileGrievance({ complainantName: 'A', complainantContact: 'a@b.c', description: 'description here ok', now: NOW }), 'off', 'x', NOW); } catch (e) { threw = true; }
  a(threw, 'Cannot resolve with too-short resolution');
}

// ────────────────────────────────────────────────────────────
sec('SLA — within window');
{
  const g = G.fileGrievance({ complainantName: 'A', complainantContact: 'a@b.c', description: 'description here ok', now: NOW });
  const s = G.slaStatus(g, NOW + 10*HOUR);
  a(!s.ackBreached,     'Not breached at 10h');
  a(s.ackHoursLeft >= 13, 'Reports hours remaining');
  a(!s.resolveBreached,   'Resolve SLA intact');
  a(!s.needsEscalation,   'No escalation needed');
}

// ────────────────────────────────────────────────────────────
sec('SLA — breached acknowledgment');
{
  const g = G.fileGrievance({ complainantName: 'A', complainantContact: 'a@b.c', description: 'description here ok', now: NOW });
  const s = G.slaStatus(g, NOW + 25*HOUR);
  a(s.ackBreached,     'Ack SLA breached after 24h with no acknowledge');
  a(s.needsEscalation, 'Flagged for escalation');
}

// ────────────────────────────────────────────────────────────
sec('SLA — acknowledged within window stops the ack-breach flag');
{
  let g = G.fileGrievance({ complainantName: 'A', complainantContact: 'a@b.c', description: 'description here ok', now: NOW });
  g = G.acknowledge(g, 'off', 'note', NOW + 5*HOUR);
  const s = G.slaStatus(g, NOW + 30*HOUR);
  a(!s.ackBreached, 'Ack breach flag does not fire once acknowledged');
}

// ────────────────────────────────────────────────────────────
sec('SLA — resolve breach after 15 days');
{
  let g = G.fileGrievance({ complainantName: 'A', complainantContact: 'a@b.c', description: 'description here ok', now: NOW });
  g = G.acknowledge(g, 'off', 'n', NOW + HOUR);
  const s = G.slaStatus(g, NOW + 16*DAY);
  a(s.resolveBreached, 'Resolve breach after 15d');
  a(s.needsEscalation, 'Triggers escalation');
}

// ────────────────────────────────────────────────────────────
sec('SLA — breaches list, ranked by severity then recency');
{
  // All three filed >24h before the check time so all are ack-breached
  const olderHigh = G.fileGrievance({ complainantName: 'A', complainantContact: 'a@b.c', description: 'description here ok', severity: G.SEVERITY.HIGH, now: NOW });
  const newerMed  = G.fileGrievance({ complainantName: 'B', complainantContact: 'b@b.c', description: 'description here ok', severity: G.SEVERITY.MED,  now: NOW + HOUR });
  const newerCrit = G.fileGrievance({ complainantName: 'C', complainantContact: 'c@b.c', description: 'description here ok', severity: G.SEVERITY.CRITICAL, now: NOW + 2*HOUR });
  const b = G.slaBreaches([olderHigh, newerMed, newerCrit], NOW + 30*HOUR);
  a(b.length === 3,                                       'All three are breached');
  a(b[0].grievance.severity === G.SEVERITY.CRITICAL,      'Critical sorts first');
  a(b[1].grievance.severity === G.SEVERITY.HIGH,          'High second');
  a(b[2].grievance.severity === G.SEVERITY.MED,           'Med third');
}

// ────────────────────────────────────────────────────────────
sec('POLICY — rendering with full config');
{
  const cfg = {
    PLATFORM_LEGAL_NAME: 'NEXUS Commerce Pvt Ltd',
    PLATFORM_ADDRESS: 'Jaipur, Rajasthan',
    PLATFORM_EMAIL: 'hello@nexus.example',
    GRIEVANCE_OFFICER_NAME: 'Priya Sharma',
    GRIEVANCE_OFFICER_EMAIL: 'grievance@nexus.example',
    GRIEVANCE_OFFICER_PHONE: '+91 98765 43210',
    NODAL_OFFICER_NAME: 'Priya Sharma',
    NODAL_OFFICER_EMAIL: 'nodal@nexus.example',
    DPO_NAME: 'Priya Sharma',
    DPO_EMAIL: 'dpo@nexus.example',
    LAST_UPDATED: '2026-05-29',
  };
  const grievance = G.renderPolicy('grievance', cfg);
  a(grievance.missing.length === 0,            'No missing fields with full config');
  a(grievance.rendered.includes('Priya Sharma'), 'Officer name interpolated');
  a(grievance.rendered.includes('+91 98765 43210'), 'Phone interpolated');
  a(!grievance.rendered.includes('{'),         'No unresolved merge fields remain');

  const ready = G.policyReadiness(cfg);
  a(ready.ready === true,    'Readiness true with full config');
  a(ready.missing.length === 0, 'No missing fields listed');
}

// ────────────────────────────────────────────────────────────
sec('POLICY — rendering with partial config flags gaps honestly');
{
  const partial = { PLATFORM_LEGAL_NAME: 'NEXUS', LAST_UPDATED: '2026-05-29' };
  const ren = G.renderPolicy('privacy', partial);
  a(ren.missing.includes('DPO_NAME'), 'Missing DPO_NAME flagged');
  a(ren.rendered.includes('[DPO_NAME NOT CONFIGURED]'), 'Placeholder marks the gap in the output');

  const ready = G.policyReadiness(partial);
  a(ready.ready === false,                  'Readiness false');
  a(ready.missing.length > 5,               'Multiple missing fields listed');
  a(ready.missing.includes('GRIEVANCE_OFFICER_NAME'), 'Grievance officer flagged');
}

// ────────────────────────────────────────────────────────────
sec('POLICY — unknown name throws');
{
  let threw = false;
  try { G.renderPolicy('not_a_policy', {}); } catch (e) { threw = true; }
  a(threw, 'Unknown policy name throws');
}

// ────────────────────────────────────────────────────────────
sec('CONSENT — defaults and updates');
{
  const d = G.defaultConsent();
  a(d.essential === true,    'Essential cookies on by default');
  a(d.analytics === false,   'Analytics off by default');
  a(d.capturedAt === null,   'No capture timestamp until set');

  const updated = G.setConsent(d, { analytics: true, marketing: false }, NOW);
  a(updated.analytics === true,   'Analytics turned on');
  a(updated.marketing === false,  'Marketing stays off');
  a(updated.capturedAt === NOW,   'Capture timestamp recorded');
  a(Object.isFrozen(updated),     'Updated consent is frozen');

  const withdrawn = G.withdrawConsent(updated, NOW + DAY);
  a(withdrawn.analytics === false, 'Withdrawal turns off non-essential');
  a(withdrawn.essential === true,  'Essential cannot be withdrawn');
}

// ────────────────────────────────────────────────────────────
sec('CONSENT — essential cannot be refused');
{
  const d = G.defaultConsent();
  const tried = G.setConsent(d, { essential: false, analytics: true }, NOW);
  a(tried.essential === true, 'Essential remains true even when refused');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
