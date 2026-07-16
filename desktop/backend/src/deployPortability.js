'use strict';
/**
 * deployPortability — makes NEXUS deployable to ANY platform from a GitHub repo and assists
 * the founder through it: per-platform settings, an env preflight (test vs real-money), and
 * a deploy-log error diagnoser. No lock-in: same repo → Render, Railway, Fly, Heroku, Cloud
 * Run, DigitalOcean, Vercel/Netlify (static), or bare Docker/VPS. Complements deployAgent.js
 * (which judges release readiness); this one handles the mechanics of shipping anywhere.
 */
const START = 'node backend/server.js';
const HEALTH = '/health';

const PLATFORMS = {
  render:       { label: 'Render',           start: START, healthCheck: HEALTH, rootDir: 'repo root', build: 'none',           file: 'render.yaml',  notes: 'Blueprint auto-config, or set Start Command manually. NODE_ENV=development for mock test deploys.' },
  railway:      { label: 'Railway',          start: START, healthCheck: HEALTH, rootDir: 'repo root', build: 'nixpacks auto',  file: 'railway.json', notes: 'Reads package.json start. Add env in dashboard.' },
  fly:          { label: 'Fly.io',           start: START, healthCheck: HEALTH, rootDir: 'repo root', build: 'Dockerfile',     file: 'fly.toml',     notes: '`fly launch` then `fly deploy`.' },
  heroku:       { label: 'Heroku',           start: START, healthCheck: HEALTH, rootDir: 'repo root', build: 'nodejs bp',      file: 'Procfile',     notes: 'web: node backend/server.js — binds $PORT (it does).' },
  cloudrun:     { label: 'Google Cloud Run', start: START, healthCheck: HEALTH, rootDir: 'repo root', build: 'Dockerfile',     file: 'Dockerfile',   notes: 'Listens on $PORT (8080). `gcloud run deploy --source .`' },
  digitalocean: { label: 'DigitalOcean App', start: START, healthCheck: HEALTH, rootDir: 'repo root', build: 'buildpack',      file: 'package.json', notes: 'App Platform reads package.json start.' },
  vercel:       { label: 'Vercel (static)',  start: 'n/a',  healthCheck: '/',   rootDir: 'deploy/',   build: 'static',         file: 'vercel.json',  notes: 'Deploy the static site from deploy/. Backend needs a Node host.' },
  netlify:      { label: 'Netlify (static)', start: 'n/a',  healthCheck: '/',   rootDir: 'deploy/',   build: 'static',         file: 'netlify.toml', notes: 'Drag deploy/ to Netlify Drop, or connect repo (publish dir = deploy/).' },
  docker:       { label: 'Docker / any VPS', start: 'docker run -e PORT=8080 -p 8080:8080 nexus', healthCheck: HEALTH, rootDir: 'repo root', build: 'Dockerfile', file: 'Dockerfile', notes: 'docker build -t nexus . && run.' },
};

const REQUIRED_FOR_MONEY = ['NODE_ENV', 'AUTH_SECRET', 'FOUNDER_TOKEN', 'WEBHOOK_SECRET', 'ENCRYPTION_KEY', 'PAYMENTS_PROVIDER', 'DATABASE_URL', 'COMPLIANCE_CONFIRMED'];

function platforms() { return Object.keys(PLATFORMS).map((k) => ({ id: k, label: PLATFORMS[k].label, config_file: PLATFORMS[k].file })); }

function config(platformId) {
  const p = PLATFORMS[platformId];
  if (!p) return { ok: false, error: 'unknown platform', platforms: platforms() };
  return { ok: true, platform: p.label, start_command: p.start, health_check: p.healthCheck, root_directory: p.rootDir, build_command: p.build, config_file: p.file, notes: p.notes };
}

function preflight(env) {
  env = env || process.env;
  const prod = env.NODE_ENV === 'production';
  const checks = [
    { check: 'server entry', ok: true, detail: START },
    { check: 'binds process.env.PORT', ok: true, detail: 'works on every PaaS' },
    { check: 'zero dependencies', ok: true, detail: 'no install step can fail' },
    { check: 'mode', ok: true, detail: prod ? 'production (real money)' : 'development/mock (safe test deploy)' },
  ];
  if (prod) {
    REQUIRED_FOR_MONEY.forEach((k) => checks.push({ check: 'secret ' + k, ok: !!env[k], detail: env[k] ? 'set' : 'MISSING — productionGuard refuses boot' }));
    checks.push({ check: 'COMPLIANCE_CONFIRMED=true', ok: env.COMPLIANCE_CONFIRMED === 'true', detail: 'set only after lawyer sign-off' });
  } else {
    checks.push({ check: 'test-mode', ok: true, detail: 'no secrets needed; payments=mock, store=memory' });
  }
  const ready = checks.every((c) => c.ok);
  return { mode: prod ? 'production' : 'test', ready, checks, verdict: ready ? 'Ready to deploy.' : 'Resolve MISSING items (or set NODE_ENV=development for a test deploy).' };
}

function diagnose(logLine) {
  const l = String(logLine || '').toLowerCase();
  const rules = [
    { m: /server,js/, cause: 'Start command has a comma typo', fix: 'Set start command exactly: ' + START },
    { m: /module_not_found|cannot find module/, cause: 'Wrong root dir / path (server.js is in backend/)', fix: 'Root = repo root; start = ' + START },
    { m: /eaddrinuse|address already in use/, cause: 'Port hardcoded/bound', fix: 'Use process.env.PORT (already does); do not hardcode.' },
    { m: /productionguard|compliance_confirmed|refus/, cause: 'productionGuard blocked a real-money boot without config', fix: 'Test deploy: NODE_ENV=development. Real money: set all REQUIRED_FOR_MONEY + COMPLIANCE_CONFIRMED=true.' },
    { m: /permission denied|eacces/, cause: 'Binding a privileged port', fix: 'Use platform $PORT (>1024); never bind 80/443 directly.' },
    { m: /npm err|yarn.*error|lockfile|no lockfile/, cause: 'Build tried to install deps', fix: 'Zero dependencies — set build command empty or `echo none`.' },
    { m: /health ?check|unhealthy/, cause: 'Health path or startup grace', fix: 'Health = ' + HEALTH + '; allow ~20s boot grace.' },
  ];
  const hit = rules.find((r) => r.m.test(l));
  return hit ? { matched: true, cause: hit.cause, fix: hit.fix } : { matched: false, note: 'Unknown pattern — check start command = ' + START + ' and NODE_ENV. Paste the full log.' };
}

module.exports = { PLATFORMS, START, HEALTH, REQUIRED_FOR_MONEY, platforms, config, preflight, diagnose };
