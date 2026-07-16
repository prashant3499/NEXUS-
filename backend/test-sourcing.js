'use strict';

const S = require('./src/sourcing');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('SCORING — Niryatak prospect with full export signals');
{
  const r = S.scoreLead({
    hasIEC: true, exportingAlready: true, hasGST: true,
    monthlyRevenue10L: true, onGJEPCorEPCH: true,
  });
  a(r.bestTier === 'niryatak',                       'Best tier is niryatak');
  a(r.bestScore === 100,                              'Score is 100 (all signals match)');
  a(r.scores.niryatak === 100,                        'Niryatak score perfect');
  a(r.scores.karigar < 50,                            'Karigar score low (signals mismatch)');
}

sec('SCORING — Karigar prospect with artisan signals');
{
  const r = S.scoreLead({
    registeredArtisan: true, hasNoGST: true, hasNoIEC: true,
    hasGITag: true, hasBankAccount: true,
  });
  a(r.bestTier === 'karigar',                         'Karigar tier identified');
  a(r.bestScore === 100,                              'Perfect karigar score');
  a(r.scores.niryatak < 50,                            'Niryatak score correctly low');
}

sec('SCORING — partial signals score correctly');
{
  const r = S.scoreLead({ hasGST: true, hasWebsite: true });
  a(r.scores.vyapari > 0,                              'Partial signals yield non-zero vyapari score');
  a(r.scores.vyapari < 100,                            'Partial signals yield sub-100 score');
  a(r.scores.karigar === 0,                            'Karigar score zero when no karigar signals');
}

sec('SCORING — empty signals all zero');
{
  const r = S.scoreLead({});
  a(r.bestScore === 0,                                  'No signals → score 0');
  a(Object.values(r.scores).every(s => s === 0),       'All tier scores zero');
}

sec('SCORING — cooperative recognized as Sansthan');
{
  const r = S.scoreLead({
    isCooperative: true, memberCount50plus: true, hasGST: true, isFPO: true,
  });
  a(r.bestTier === 'sansthan',                         'Cooperative → sansthan tier');
  a(r.scores.sansthan === 100,                         'Sansthan perfect score');
}

// ────────────────────────────────────────────────────────────
sec('LEAD CREATION — basic fields');
{
  const lead = S.createLead({
    source: 'gjepc_member_directory',
    segment: S.SEGMENTS.NIRYATAK,
    name: 'Surat Diamond House',
    contactHandles: { whatsapp: '+919876543210', email: 'contact@example.in' },
    signals: { hasIEC: true, exportingAlready: true },
    notes: 'Met at IIJS 2026',
  });
  a(lead.id.startsWith('lead_'),                       'ID has correct prefix');
  a(lead.source === 'gjepc_member_directory',          'Source preserved');
  a(lead.segment === 'niryatak_prospect',              'Segment preserved');
  a(lead.name === 'Surat Diamond House',                'Name preserved');
  a(lead.status === 'new',                              'Starts in new status');
  a(lead.history.length === 1,                          'History has create entry');
  a(lead.history[0].from === null,                      'Create entry has null from');
  a(lead.history[0].to === 'new',                       'Create entry goes to new');
  a(lead.score > 0,                                     'Score computed');
  a(lead.suggestedTier === 'niryatak',                  'Suggested tier from scoring');
}

sec('LEAD CREATION — validation');
{
  let threw = false;
  try { S.createLead({}); } catch (e) { threw = true; }
  a(threw, 'No source throws');

  threw = false;
  try { S.createLead({ source: 'gjepc_member_directory' }); } catch (e) { threw = true; }
  a(threw, 'No segment throws');

  threw = false;
  try { S.createLead({ source: 'unknown', segment: S.SEGMENTS.NIRYATAK, name: 'X' }); } catch (e) { threw = true; }
  a(threw, 'Unknown source throws');

  threw = false;
  try { S.createLead({ source: 'gjepc_member_directory', segment: 'unknown', name: 'X' }); } catch (e) { threw = true; }
  a(threw, 'Unknown segment throws');

  threw = false;
  try { S.createLead({ source: 'gjepc_member_directory', segment: S.SEGMENTS.NIRYATAK }); } catch (e) { threw = true; }
  a(threw, 'No name throws');
}

sec('LEAD IMMUTABILITY — frozen objects');
{
  const lead = S.createLead({
    source: 'gi_tag_holders', segment: S.SEGMENTS.VYAPARI, name: 'Khurja Pottery Co',
  });
  let threw = false;
  try { lead.status = 'onboarded'; } catch (e) { threw = true; }
  // Object.freeze in non-strict mode silently fails; in strict mode throws
  a(lead.status === 'new' || threw, 'Frozen lead resists direct mutation');
}

// ────────────────────────────────────────────────────────────
sec('STATUS TRANSITIONS — valid forward path');
{
  let lead = S.createLead({
    source: 'gjepc_member_directory', segment: S.SEGMENTS.NIRYATAK, name: 'Test Co',
  });
  lead = S.updateLeadStatus(lead, 'researched', 'read their GJEPC profile');
  a(lead.status === 'researched',                       'Moved to researched');
  a(lead.history.length === 2,                          'History has 2 entries');
  a(lead.history[1].from === 'new',                     'History records from-state');

  lead = S.updateLeadStatus(lead, 'contacted', 'sent first whatsapp');
  lead = S.updateLeadStatus(lead, 'responded', 'they replied');
  lead = S.updateLeadStatus(lead, 'demo_scheduled', 'booked Tuesday call');
  lead = S.updateLeadStatus(lead, 'demo_done', 'demo went well');
  lead = S.updateLeadStatus(lead, 'onboarded', 'paid first invoice');
  a(lead.status === 'onboarded',                        'Full happy path works');
  a(lead.history.length === 7,                          'All transitions recorded');
}

sec('STATUS TRANSITIONS — invalid transitions throw');
{
  let lead = S.createLead({
    source: 'gjepc_member_directory', segment: S.SEGMENTS.NIRYATAK, name: 'X',
  });
  let threw = false;
  try { S.updateLeadStatus(lead, 'onboarded'); } catch (e) { threw = true; }
  a(threw, 'Cannot jump new → onboarded directly');

  threw = false;
  try { S.updateLeadStatus(lead, 'demo_done'); } catch (e) { threw = true; }
  a(threw, 'Cannot jump new → demo_done');
}

sec('STATUS TRANSITIONS — terminal states are sticky');
{
  let lead = S.createLead({
    source: 'gjepc_member_directory', segment: S.SEGMENTS.NIRYATAK, name: 'X',
  });
  lead = S.updateLeadStatus(lead, 'rejected', 'not a fit');
  let threw = false;
  try { S.updateLeadStatus(lead, 'contacted'); } catch (e) { threw = true; }
  a(threw, 'Cannot un-reject');

  // But onboarded leads also terminal
  let lead2 = S.createLead({ source: 'gjepc_member_directory', segment: S.SEGMENTS.NIRYATAK, name: 'Y' });
  lead2 = S.updateLeadStatus(lead2, 'contacted');
  lead2 = S.updateLeadStatus(lead2, 'responded');
  lead2 = S.updateLeadStatus(lead2, 'demo_scheduled');
  lead2 = S.updateLeadStatus(lead2, 'demo_done');
  lead2 = S.updateLeadStatus(lead2, 'onboarded');
  threw = false;
  try { S.updateLeadStatus(lead2, 'rejected'); } catch (e) { threw = true; }
  a(threw, 'Cannot un-onboard');
}

sec('STATUS TRANSITIONS — dormant can re-engage');
{
  let lead = S.createLead({
    source: 'gi_tag_holders', segment: S.SEGMENTS.VYAPARI, name: 'X',
  });
  lead = S.updateLeadStatus(lead, 'contacted');
  lead = S.updateLeadStatus(lead, 'dormant', '30 days no response');
  lead = S.updateLeadStatus(lead, 'responded', 'replied after 45 days');
  a(lead.status === 'responded',                        'Dormant lead re-engaged successfully');
}

sec('STATUS TRANSITIONS — original lead not mutated');
{
  const lead = S.createLead({
    source: 'gjepc_member_directory', segment: S.SEGMENTS.NIRYATAK, name: 'X',
  });
  const newLead = S.updateLeadStatus(lead, 'contacted');
  a(lead.status === 'new',                              'Original lead still has status=new');
  a(newLead.status === 'contacted',                     'New lead has status=contacted');
  a(lead.history.length === 1,                          'Original history unchanged');
  a(newLead.history.length === 2,                       'New history has both entries');
}

// ────────────────────────────────────────────────────────────
sec('DORMANT DETECTION — flags old non-terminal leads');
{
  const now = Date.now();
  const old = now - 45 * 24 * 60 * 60 * 1000;
  const recent = now - 5 * 24 * 60 * 60 * 1000;
  const leads = [
    { id: 'l1', status: 'contacted',  updatedAt: old },
    { id: 'l2', status: 'contacted',  updatedAt: recent },
    { id: 'l3', status: 'onboarded',  updatedAt: old },   // terminal, skip
    { id: 'l4', status: 'rejected',   updatedAt: old },   // terminal, skip
    { id: 'l5', status: 'researched', updatedAt: old },
  ];
  const flagged = S.detectDormant(leads, { now, cutoffDays: 30 });
  a(flagged.length === 2,                                 'Two dormant flagged');
  a(flagged.includes('l1'),                               'Old contacted flagged');
  a(flagged.includes('l5'),                               'Old researched flagged');
  a(!flagged.includes('l3'),                              'Onboarded NOT flagged');
  a(!flagged.includes('l4'),                              'Rejected NOT flagged');
  a(!flagged.includes('l2'),                              'Recent activity NOT flagged');
}

// ────────────────────────────────────────────────────────────
sec('OUTREACH TEMPLATES — render with placeholders');
{
  const r = S.renderOutreach('niryatak_first_touch_en', {
    name: 'Mr. Mehta',
    founder_name: 'Krishna',
  });
  a(r.body.includes('Mr. Mehta'),                       'Name placeholder filled');
  a(r.body.includes('Krishna'),                          'Founder name placeholder filled');
  a(!r.body.includes('{{name}}'),                        'No unfilled placeholder for name');
  a(!r.body.includes('{{founder_name}}'),                'No unfilled placeholder for founder');
  a(r.ready_to_send === true,                            'All placeholders filled → ready to send');
  a(r.channel === 'whatsapp',                            'Channel preserved');
  a(r.segment === 'niryatak_prospect',                   'Segment preserved');
}

sec('OUTREACH TEMPLATES — unfilled placeholders surface');
{
  const r = S.renderOutreach('vyapari_first_touch_en', { name: 'Vendor' });
  a(r.unfilled_placeholders.includes('company'),         'company placeholder unfilled');
  a(r.unfilled_placeholders.includes('founder_name'),    'founder_name placeholder unfilled');
  a(r.ready_to_send === false,                           'Incomplete fill → not ready');
}

sec('OUTREACH TEMPLATES — Hindi for Karigar');
{
  const r = S.renderOutreach('karigar_first_touch_hi', {
    name: 'राम', founder_name: 'कृष्ण',
  });
  a(r.language === 'hi',                                 'Hindi template selected');
  a(r.body.includes('राम'),                              'Hindi name filled');
  a(r.body.includes('NEXUS'),                            'Brand preserved');
}

sec('OUTREACH TEMPLATES — pick by segment + language');
{
  const k = S.pickFirstTouchTemplate(S.SEGMENTS.KARIGAR, 'hi');
  a(k === 'karigar_first_touch_hi',                      'Karigar+hi resolves to Hindi template');

  const n = S.pickFirstTouchTemplate(S.SEGMENTS.NIRYATAK, 'en');
  a(n === 'niryatak_first_touch_en',                     'Niryatak+en resolves to English template');

  const f = S.pickFirstTouchTemplate(S.SEGMENTS.KARIGAR, 'en');
  // No karigar_first_touch_en exists — should fall back to en for any segment
  a(f === null || (typeof f === 'string'),                'Returns null or fallback when exact match absent');
}

sec('OUTREACH TEMPLATES — unknown template throws');
{
  let threw = false;
  try { S.renderOutreach('nonexistent_template'); } catch (e) { threw = true; }
  a(threw, 'Unknown template throws');
}

// ────────────────────────────────────────────────────────────
sec('FUNNEL METRICS — stage counts');
{
  const leads = [
    { id: 'l1', status: 'new',         history: [{ to: 'new' }] },
    { id: 'l2', status: 'contacted',   history: [{ to: 'new' }, { to: 'contacted' }] },
    { id: 'l3', status: 'demo_done',   history: [{ to: 'new' }, { to: 'contacted' }, { to: 'responded' }, { to: 'demo_scheduled' }, { to: 'demo_done' }] },
    { id: 'l4', status: 'onboarded',   history: [{ to: 'new' }, { to: 'contacted' }, { to: 'responded' }, { to: 'demo_scheduled' }, { to: 'demo_done' }, { to: 'onboarded' }] },
    { id: 'l5', status: 'rejected',    history: [{ to: 'new' }, { to: 'contacted' }, { to: 'rejected' }] },
  ];
  const m = S.funnelMetrics(leads);
  a(m.totalLeads === 5,                                  'Total counted');
  a(m.onboardedCount === 1,                              '1 onboarded');
  a(m.overallConversionPct === 20.0,                     '20% overall conversion');
  a(m.stages.contacted === 1,                            'Current contacted count');
  a(m.reached.contacted === 4,                            '4 ever reached contacted');
  a(m.reached.onboarded === 1,                            '1 ever reached onboarded');
}

sec('FUNNEL METRICS — leakiest step identified');
{
  // 10 leads contact, 9 respond, only 2 schedule demos (huge leak at responded→demo_scheduled)
  // All leads pass through researched first, so the responded→demo step is the leak
  const fullHistory = (toStage) => {
    const stages = ['new', 'researched', 'contacted', 'responded', 'demo_scheduled'];
    const upTo = stages.indexOf(toStage);
    return stages.slice(0, upTo + 1).map(s => ({ to: s }));
  };
  const leads = [];
  for (let i = 0; i < 10; i++) {
    leads.push({ id: 'l' + i, status: 'contacted', history: fullHistory('contacted') });
  }
  for (let i = 10; i < 19; i++) {
    leads.push({ id: 'l' + i, status: 'responded', history: fullHistory('responded') });
  }
  for (let i = 19; i < 21; i++) {
    leads.push({ id: 'l' + i, status: 'demo_scheduled', history: fullHistory('demo_scheduled') });
  }
  const m = S.funnelMetrics(leads);
  a(m.leakiestStep === 'responded_to_demo_scheduled',    'Leakiest step correctly identified');
  a(m.leakiestRatePct !== null,                          'Leakiest rate computed');
  a(m.leakiestRatePct < 50,                              'Leakiest rate < 50% (real leak)');
}

sec('FUNNEL METRICS — empty input');
{
  const m = S.funnelMetrics([]);
  a(m.totalLeads === 0,                                  'Empty input → 0 leads');
  a(m.onboardedCount === 0,                              'Empty input → 0 onboarded');
  a(m.overallConversionPct === 0,                        'Empty input → 0% conversion');
  a(m.leakiestStep === null,                             'Empty input → no leakiest step');
}

// ────────────────────────────────────────────────────────────
sec('RANK BY PRIORITY — descending score, filtered to actionable');
{
  const leads = [
    { id: 'l1', status: 'new',       score: 65 },
    { id: 'l2', status: 'new',       score: 90 },
    { id: 'l3', status: 'contacted', score: 95 },   // not in actionable filter
    { id: 'l4', status: 'researched',score: 30 },
    { id: 'l5', status: 'dormant',   score: 80 },   // dormant IS actionable
    { id: 'l6', status: 'onboarded', score: 100 },  // not actionable
  ];
  const r = S.rankByPriority(leads);
  a(r.length === 4,                                       'Filters to actionable statuses');
  a(r[0].id === 'l2',                                     'Highest-scored (l2) first');
  a(r[1].id === 'l5',                                     'Second highest (l5 dormant) next');
  a(r[2].id === 'l1',                                     'Third highest');
  a(r[3].id === 'l4',                                     'Lowest score last');
}

// ────────────────────────────────────────────────────────────
sec('LEAD SOURCES — registry shape');
{
  const sources = S.LEAD_SOURCES;
  a('gjepc_member_directory' in sources,                  'GJEPC source present');
  a('gi_tag_holders' in sources,                          'GI registry source present');
  a('udyam_aadhaar' in sources,                           'Udyam source present');
  a('fpo_database' in sources,                            'FPO source present');
  a('state_handicraft_boards' in sources,                 'State boards source present');
  a('tourism_operator_registry' in sources,               'Tourism source present');
  a(Object.keys(sources).length >= 6,                     'At least 6 sources documented');
  a(sources.gjepc_member_directory.url.startsWith('http'),'GJEPC source has URL');
  a('typical_segment' in sources.gjepc_member_directory,  'Source declares typical segment');
}

// ────────────────────────────────────────────────────────────
sec('END-TO-END — source GI holder, score, render outreach, transition, onboard');
{
  // 1. Create lead from GI registry — a verified producer
  let lead = S.createLead({
    source: 'gi_tag_holders',
    segment: S.SEGMENTS.VYAPARI,
    name: 'Bhuj Bandhani Cooperative',
    contactHandles: { whatsapp: '+912832123456', email: 'info@bhujbandhani.example' },
    signals: { hasGST: true, hasGITag: true, hasWebsite: true, monthlyRevenue1L: true },
    notes: 'Registered against GI 92 — Kutch Bandhani',
  });
  a(lead.score > 60,                                      'GI-tagged GST holder scores high for vyapari');
  a(lead.suggestedTier === 'vyapari',                     'Suggested vyapari tier');

  // 2. Pick the right template
  const tpl = S.pickFirstTouchTemplate(lead.segment, 'en');
  a(tpl === 'vyapari_first_touch_en',                     'Picked vyapari english template');

  // 3. Render outreach
  const msg = S.renderOutreach(tpl, {
    name: 'Bhuj Cooperative team',
    company: 'Bhuj Bandhani Cooperative',
    founder_name: 'Krishna',
  });
  a(msg.ready_to_send === true,                           'All placeholders filled');
  a(msg.body.length < 600,                                'Message length appropriate for WhatsApp');

  // 4. Transition through funnel
  lead = S.updateLeadStatus(lead, 'researched');
  lead = S.updateLeadStatus(lead, 'contacted', 'sent whatsapp');
  lead = S.updateLeadStatus(lead, 'responded', 'replied with questions');
  lead = S.updateLeadStatus(lead, 'demo_scheduled');
  lead = S.updateLeadStatus(lead, 'demo_done');
  lead = S.updateLeadStatus(lead, 'onboarded', 'paid Vyapari ₹2,499 sub');

  a(lead.status === 'onboarded',                          'Lead fully onboarded');
  a(lead.history.length === 7,                            'Full audit trail captured');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
