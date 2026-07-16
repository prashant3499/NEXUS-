'use strict';
/**
 * openData — registry of REAL Indian government open-data sources NEXUS uses to build
 * its launch database, with honest access flags. "no-auth" sources can be used to
 * source clusters, GIs, pincodes and scheme-eligibility BEFORE incorporation and with
 * NO money. Personal data (the workers themselves) is never bulk-downloaded — only
 * public registries, aggregate stats and verification endpoints.
 */
const ACCESS = { OPEN: 'open_download', FREE_KEY: 'free_api_key', PUBLIC_BROWSE: 'public_browse', REGISTER: 'register_free', PARTNER: 'partner_onboarding' };

const SOURCES = [
  { id: 'ogd', name: 'data.gov.in (Open Government Data)', org: 'NIC / MeitY',
    url: 'https://www.data.gov.in', api: 'https://api.data.gov.in',
    access: [ACCESS.OPEN, ACCESS.FREE_KEY], auth_required: false, commercial_ok: true,
    data: 'Datasets in CSV/JSON/XML across economy, industry, demographics; includes the All-India Pincode Directory.',
    use: 'Cluster & district stats, pincode→geo (fills the logistics gap), MSME/handloom datasets.' },
  { id: 'gi_registry', name: 'GI Registry (Geographical Indications)', org: 'CGPDTM / DPIIT',
    url: 'https://search.ipindia.gov.in/GIRPublic/', list: 'https://ipindia.gov.in/registry',
    access: [ACCESS.PUBLIC_BROWSE, ACCESS.OPEN], auth_required: false, commercial_ok: true,
    data: 'Public register of 600+ GI products (Part A) and their registered authorised producers (Part B), with origin region.',
    use: 'The provenance backbone: maps each craft to its cluster and its legitimate producers — the core prospect map.' },
  { id: 'myscheme', name: 'myScheme', org: 'MeitY / NeGD',
    url: 'https://www.myscheme.gov.in', api: 'https://directory.apisetu.gov.in/api-collection/myscheme',
    access: [ACCESS.PUBLIC_BROWSE, ACCESS.REGISTER], auth_required: false, commercial_ok: true,
    data: 'One-stop catalogue of central & state schemes with eligibility rules.',
    use: 'Match each artisan to the schemes they qualify for; power the eligibility feature.' },
  { id: 'apisetu', name: 'API Setu', org: 'MeitY / NeGD',
    url: 'https://www.apisetu.gov.in', dir: 'https://directory.apisetu.gov.in',
    access: [ACCESS.REGISTER], auth_required: true, commercial_ok: true,
    data: '6,000+ government APIs; non-personal "service" APIs include GSTIN and PAN verification.',
    use: 'Verify a partner business (GSTIN/PAN) without handling personal data; discover more govt APIs.' },
  { id: 'odop', name: 'ODOP (One District One Product)', org: 'DPIIT',
    url: 'https://odop.gov.in', access: [ACCESS.PUBLIC_BROWSE], auth_required: false, commercial_ok: true,
    data: 'District-to-signature-product mapping across India.',
    use: 'Target sourcing by district; align with state ODOP cells for partnerships.' },
  { id: 'eshram', name: 'e-Shram (aggregate / verification)', org: 'Ministry of Labour',
    url: 'https://eshram.gov.in', access: [ACCESS.PUBLIC_BROWSE, ACCESS.PARTNER], auth_required: true, commercial_ok: false,
    data: 'Public dashboards & aggregate stats are open; the worker registry itself is personal data (consent/partner only).',
    use: 'Sizing & cluster planning from public stats; formalisation only with the worker\'s consent.' },
  { id: 'ondc', name: 'ONDC (Open Network for Digital Commerce)', org: 'DPIIT',
    url: 'https://ondc.org', access: [ACCESS.PARTNER], auth_required: true, commercial_ok: true,
    data: 'Open commerce network — a distribution channel, not a dataset.',
    use: 'List verified makers to buyer apps across the network after network onboarding.' },
];

function catalog() { return SOURCES; }
function noAuthSources() { return SOURCES.filter((s) => s.auth_required === false); }
function launchUsable() {
  // sources you can use to build the launch DB today, with no authorisation and no money
  return noAuthSources().map((s) => ({ id: s.id, name: s.name, url: s.url, use: s.use }));
}

module.exports = { ACCESS, SOURCES, catalog, noAuthSources, launchUsable };
