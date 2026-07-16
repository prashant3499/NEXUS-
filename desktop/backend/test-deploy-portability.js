const assert = require("assert");
const dp = require("./src/deployPortability");
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; } catch (e) { fail++; console.log("FAIL", n, e.message); } }

t("lists 8+ platforms", () => assert.ok(dp.platforms().length >= 8));
t("all non-static hosts share the same start command", () => {
  ["render", "railway", "fly", "heroku", "cloudrun", "digitalocean"].forEach((p) =>
    assert.equal(dp.config(p).start_command, "node backend/server.js"));
});
t("static hosts serve deploy/", () => {
  assert.equal(dp.config("netlify").root_directory, "deploy/");
  assert.equal(dp.config("vercel").root_directory, "deploy/");
});
t("unknown platform guarded", () => assert.ok(!dp.config("mainframe").ok));
t("preflight test-mode ready with no secrets", () => {
  const r = dp.preflight({}); assert.equal(r.mode, "test"); assert.ok(r.ready);
});
t("preflight production flags missing secrets", () => {
  const r = dp.preflight({ NODE_ENV: "production" });
  assert.equal(r.mode, "production"); assert.ok(!r.ready);
  assert.ok(r.checks.some((c) => /MISSING/.test(c.detail)));
});
t("preflight production ready when all set", () => {
  const env = { NODE_ENV: "production", AUTH_SECRET: "x", FOUNDER_TOKEN: "x", WEBHOOK_SECRET: "x", ENCRYPTION_KEY: "x", PAYMENTS_PROVIDER: "razorpay", DATABASE_URL: "x", COMPLIANCE_CONFIRMED: "true" };
  assert.ok(dp.preflight(env).ready);
});
t("diagnose comma typo", () => { const d = dp.diagnose("node server,js"); assert.ok(d.matched); assert.ok(/comma/i.test(d.cause)); });
t("diagnose MODULE_NOT_FOUND", () => assert.ok(dp.diagnose("Error: Cannot find module server.js").matched));
t("diagnose productionGuard refusal", () => assert.ok(/development/.test(dp.diagnose("productionGuard refused boot").fix)));
t("diagnose npm/lockfile build", () => assert.ok(/dependencies/.test(dp.diagnose("info No lockfile found").fix)));
t("diagnose unknown gives guidance", () => assert.ok(!dp.diagnose("weird galaxy error").matched));
console.log(pass + " passed, " + fail + " failed");
