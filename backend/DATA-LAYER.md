# NEXUS — Data Layer: state & the go-live switch

Verified state of the three data questions you asked about.

## Relational database — ✅ BUILT and verified (STORE_DRIVER=postgres)
- The whole platform state persists through one store seam. `src/pgStore.js` makes it durable:
  **hydrate from Postgres at boot** (short-lived child process, so the synchronous state
  init reads warm data) and **write-through on every save** (debounced, last-write-wins,
  retries on failure). One row (`nexus_state`) holds the state document — simple and
  atomic at pilot scale; the relational DDL in docs/BACKEND-SCHEMA.md remains the
  scale-up path.
- `pg` is the single sanctioned dependency (CLAUDE.md rule 2), lazily required only when
  configured. Missing driver or DATABASE_URL → file store with an honest reason in the
  boot line (`store=file (FALLBACK: …)`), never a crash.
- Also fixed here: `store.save()` used to silently drop `prospect_db`, `ops_control`,
  `guardian_arrangements`, `watchdog_history`, `grievance_log`, `charity_fund`, `reviews`
  — CRM stages and agent controls reset on every restart. All domains now round-trip
  (regression-tested in `test-store-postgres.js`).

**Switch on (Render):** create a Postgres instance, then set
```bash
STORE_DRIVER=postgres
DATABASE_URL=postgres://USER:PASS@HOST:5432/nexus
```
Build command runs `npm install --omit=dev` (installs only `pg`). Verified end-to-end:
seller + consents + an advanced CRM stage survived kill → disk wipe → reboot.

## Vector database — ❌ not built, and not needed yet (honest)
- There is **no vector DB** (no Pinecone/FAISS/Weaviate/Qdrant), and that's the right call for this stage.
- Search today is keyword + category filters, which is correct for a small catalogue. A vector DB earns its place only once the catalogue is large enough that **semantic search / RAG** beats filters — a post-traction optimisation, not a launch blocker.
- When that day comes, it slots in behind the same kind of adapter seam.

## Cloud object storage — ❌ the real go-live gap
- **Not wired** (no S3/GCS/Cloudinary). Product images are currently emoji placeholders.
- This is the genuine blocker for *real* listings: real photographs of real products have to live somewhere durable and CDN-served.
- **Switch for go-live:** add an object-storage provider (S3 / Cloudinary / Cloudflare R2), store image URLs on the product record (the schema already carries a media field), and serve via the CDN. This is a contained addition behind one upload helper.

## Summary
| Layer | State | To go live |
|---|---|---|
| Relational DB | Adapter ready, file store active | `npm i pg` + `DATABASE_URL` + `STORE_DRIVER=postgres` |
| Vector DB | Absent (intentionally) | Add later for semantic search — not a blocker |
| Cloud storage | Absent | Add S3/Cloudinary upload + CDN — needed for real photos |

Nothing here is a rewrite — the relational seam is one env change, and cloud storage is one upload helper. The data layer is *ready for* go-live; it just needs a real host (which this sandbox isn't).
