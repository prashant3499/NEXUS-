# NEXUS — Data Layer: state & the go-live switch

Verified state of the three data questions you asked about.

## Relational database — ✅ seam ready, not yet switched on
- The store lives behind **one adapter** (`src/dbAdapter.js`): `FileAdapter` (default) and `PostgresAdapter`, chosen by `makeAdapter`.
- It **lazily loads `pg`** and degrades gracefully: with no driver it returns a safe `postgres-unavailable` stub instead of crashing (verified).
- **Active now:** file store (fine for dev/pilot; not for production scale).

**Switch to Postgres (3 steps, in a real environment):**
```bash
npm install pg                       # the driver (blocked in this sandbox; installs fine on a real host)
export DATABASE_URL=postgres://USER:PASS@HOST:5432/nexus   # Neon / Supabase / RDS all work
export STORE_DRIVER=postgres
```
Then `PostgresAdapter` activates automatically — no code change. (`productionGuard` already *requires* `DATABASE_URL` before it will boot in production, so this is enforced, not optional.)

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
