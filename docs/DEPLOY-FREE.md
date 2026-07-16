# NEXUS — Deploy Free (every available free option)

The website is one static file; the SaaS backend is zero-dependency Node.js. Both run on
free tiers. Everything below boots in **safe mock mode** (no real money, no KYC) — perfect
for testing and demos. Production hardening is a separate, later step (see end).

## A. The website (static) — free, instant
The hybrid site is `deploy/index.html`. Drag-and-drop, no account math:
- **Netlify Drop** — app.netlify.com/drop → drag the `deploy` folder → live URL
- **Cloudflare Pages** — free, upload the folder
- **Vercel** — `vercel deploy` (free hobby tier)
- **GitHub Pages** — push `index.html`, enable Pages (free)
- **Render Static Site** — free static plan, point at the folder

## B. The SaaS backend (Node) — free tiers
Config files are in `nexus-unified/`. Pick one:

| Host | How | Notes |
|------|-----|-------|
| **Render** | Connect repo → it reads `render.yaml` | Free web service; sleeps when idle |
| **Fly.io** | `fly launch` → reads `fly.toml` | Free allowance; Mumbai region (`bom`) |
| **Railway** | Connect repo → reads `Procfile` | Free trial credits |
| **Koyeb / Cyclic** | Start command `node server.js` | Free hobby tier |

All of them: build = `npm install --omit=dev` (there are no real deps), start = `node server.js`,
health check = `/health`, port from `$PORT` (auto). It just works.

## C. Local / self-host (free forever)
```bash
cd nexus-unified
node server.js            # http://localhost:4100
# or containerised:
docker compose up
```

## Going to production later (the gate, not a free step)
The backend boots in mock mode while `NODE_ENV` ≠ `production`. To go live for real money you
must set `NODE_ENV=production` **and** satisfy the `productionGuard`: rotate `AUTH_SECRET`,
`FOUNDER_TOKEN`, `WEBHOOK_SECRET`; set `PAYMENTS_PROVIDER=razorpay` + keys; set a Postgres
`DATABASE_URL`; and set `COMPLIANCE_CONFIRMED=true` (only after a lawyer + CA sign off on the
Merchant-of-Record + TCS model). Until then the platform refuses to take real money — by design.

## Honest note
Free hosting + this code = a **live, testable demo in minutes**. A live *business* still needs
the payment rail, real KYC, and the legal sign-off. Deploying is the easy part; those three are
the real gates — and they're intentionally enforced in code.
