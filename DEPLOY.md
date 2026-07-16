# Deploy NEXUS to any platform (from GitHub)

Same repo → any host. Backend entry: `node backend/server.js`. Health: `/health`. Static site: `deploy/`.
For a TEST deploy set `NODE_ENV=development` (no secrets needed, mock mode).

| Platform | How | Config file |
|---|---|---|
| Render | New Web Service → start `node backend/server.js` | render.yaml |
| Railway | New from repo (auto) | railway.json |
| Fly.io | `fly launch && fly deploy` | fly.toml + Dockerfile |
| Heroku | push repo | Procfile |
| Cloud Run | `gcloud run deploy --source .` | Dockerfile |
| DigitalOcean | App from repo | package.json |
| Docker/VPS | `docker build -t nexus . && docker run -e PORT=8080 -p 8080:8080 nexus` | Dockerfile |
| Netlify/Vercel (site) | deploy `deploy/` folder | netlify.toml / vercel.json |

Deploy assistant (founder-gated): `/api/founder/deploy` — list platforms, `?platform=fly` for exact settings, `?view=preflight` for readiness, `?diagnose=<error line>` to debug a failed build.
