#!/usr/bin/env node
'use strict';
// facts — the single source of truth, MEASURED from code. Run in CI; docs cite this, never hardcode.
const fs = require('fs'), path = require('path');
const root = __dirname;
const srcDir = path.join(root, 'src');
const modules = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).length;
const suites = fs.readdirSync(root).filter(f => /^test.*\.js$/.test(f)).length;
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const endpoints = (server.match(/if \(p === '\/api\//g) || []).length;
const gated = (server.match(/requireAuth\(/g) || []).length;
const facts = {
  generated_at: new Date().toISOString(),
  backend_modules: modules,
  test_suites: suites,
  api_endpoints: endpoints,
  auth_gated_sites: gated,
  dependencies: 0,
  frontend_canonical: 'website/nexus-app.html',
  payments_default: 'mock (PAYMENTS_PROVIDER unset)',
  store_default: 'memory (Postgres via STORE_DRIVER)',
  status: 'code-complete for pilot; live spine (auth/db/payments/notifications) = deploy-time seams',
};
console.log(JSON.stringify(facts, null, 2));
