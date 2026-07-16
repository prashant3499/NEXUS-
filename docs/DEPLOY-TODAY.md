# NEXUS — DEPLOY TODAY (every channel, in order)

You can do all of this today. The website goes live in ~2 minutes; each backend host in ~10.
Everything boots in **safe mock mode** (no real money) — exactly what you want for testing.

────────────────────────────────────────────────────────
## PART 1 — THE WEBSITE (static)  → do this first, it's instant
────────────────────────────────────────────────────────
You have `nexus-website.zip`. Unzip it → you get a folder with `index.html` + configs.

### Channel A — Netlify Drop  (fastest, no account, no CLI)
1. Open  https://app.netlify.com/drop
2. Drag the unzipped folder onto the page.
3. Done — you get a live URL like `nexus-craft.netlify.app`. Share it.

### Channel B — Cloudflare Pages
1. https://pages.cloudflare.com → "Upload assets" (Direct Upload).
2. Drag the same folder. Live on a `*.pages.dev` URL.

### Channel C — Vercel
1. https://vercel.com → New Project → drag the folder (or import a repo).
2. It reads `vercel.json`. Live on a `*.vercel.app` URL.

### Channel D — GitHub Pages  (needs a repo — see Part 3 for git)
1. Put `index.html` in a repo's root (or `/docs`).
2. Repo → Settings → Pages → Source = main branch → Save.
3. Live on `yourname.github.io/repo`.

→ Result: the same site live on up to 4 channels. Test each on your phone + desktop.

────────────────────────────────────────────────────────
## PART 2 — THE BACKEND (the full SaaS, optional today)
────────────────────────────────────────────────────────
Folder: `nexus-unified/`. Pure Node, zero dependencies. Needs a repo (Part 3).

### Channel E — Render  (recommended; reads render.yaml)
1. Push `nexus-unified` to a GitHub repo.
2. https://render.com → New → Blueprint → pick the repo. It reads `render.yaml`.
3. Deploys free; live on `*.onrender.com`. Health check: `/health`.

### Channel F — Fly.io  (reads fly.toml, Mumbai region)
1. Install flyctl, then in `nexus-unified/`:  `fly launch`  (it reads `fly.toml`) → `fly deploy`
2. Live on `*.fly.dev`.

### Channel G — Railway  (reads Procfile)
1. https://railway.app → New Project → Deploy from GitHub repo.
2. It runs `node server.js`. Live on `*.up.railway.app`.

────────────────────────────────────────────────────────
## PART 3 — GIT (one-time, for Pages / Render / Cloudflare-git / Railway)
────────────────────────────────────────────────────────
Website repo:
```
cd <unzipped-website-folder>
git init && git add . && git commit -m "NEXUS website"
git branch -M main
git remote add origin https://github.com/<you>/nexus-website.git
git push -u origin main
```
Backend repo (same steps inside `nexus-unified/`, new repo `nexus-platform`).

────────────────────────────────────────────────────────
## WHAT YOU'RE PUTTING LIVE TODAY
────────────────────────────────────────────────────────
✅ A fully clickable demo — all verticals, both languages, the cockpit, the decks.
✅ Safe: mock payments, no KYC, no real money can move.
✅ Perfect for: showing partners / cooperatives / government, and collecting real reactions.

❌ NOT live today (by design — the code refuses until these are real):
   • real payments/payouts   • real KYC   • lawyer + CA sign-off on MoR+TCS
   To go to real-money production later: set NODE_ENV=production + DATABASE_URL +
   rotate AUTH_SECRET/FOUNDER_TOKEN/WEBHOOK_SECRET + PAYMENTS_PROVIDER=razorpay +
   COMPLIANCE_CONFIRMED=true. `productionGuard` will then allow boot.

────────────────────────────────────────────────────────
## TODAY'S CHECKLIST
────────────────────────────────────────────────────────
[ ] Unzip nexus-website.zip
[ ] Netlify Drop  → live URL #1
[ ] Cloudflare Pages → live URL #2
[ ] Vercel → live URL #3
[ ] (optional) push backend repo → Render → live API
[ ] Open each URL on phone + desktop; test EN/HI, shop, cockpit, shops page
[ ] Send one URL to one real person and watch them use it
