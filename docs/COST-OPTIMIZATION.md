# NEXUS — Low-Cost Operations (caching + cost intelligence)

The main variable cost is LLM/API usage. NEXUS keeps it low with layered caching and routing —
so the same work is never paid for twice, and cheap paths are used before expensive ones.

## What's built
| Lever | Status | How it saves money |
|---|---|---|
| **AI response cache** | ✅ | `aiProvider.chat()` caches by hash(provider+model+messages) for 6h — identical prompts (repeat FAQs, same creative request) cost **zero** the second time. Proven: 2 identical + 1 new = 1 paid call saved. |
| **General TTL cache** | ✅ | `cache.js` `getOrCompute()` memoizes any expensive compute or external API response. |
| **Local-first answering** | ✅ | The co-founder's rich `answerQuestion` / client fallback answers most known intents with **no LLM call at all** — the LLM is only hit for novel questions. |
| **Monthly spend cap** | ✅ | `API_MONTHLY_CAP_PAISE` (₹30,000 default) hard-stops runaway AI spend. |
| **Ad/agent budget caps** | ✅ | `adGeneration` hard cap + agent `budgetCap`. |
| **Cache visibility** | ✅ | `GET /api/cache/stats` → entries, hits, misses, hit-rate to watch savings. |

## Additional levers to switch on at deploy (config, no rebuild)
1. **Prompt caching** — Anthropic/most providers give ~90% off on a cached prompt prefix. Put the
   long, stable system prompt in the cached prefix; you pay full price once, then a fraction.
2. **Model routing by task** — cheap model for simple/classification work, the expensive model
   only for hard reasoning. With the swappable AI layer, route Indic/simple calls to **Krutrim/
   Sarvam** (INR, cheaper) and keep a premium model for the tough cases.
3. **Batch API** — for non-realtime bulk jobs (generating product descriptions, GEO copy), batch
   endpoints are ~50% cheaper. Queue them instead of calling live.
4. **Cache external APIs** — wrap maps/geo/government-data/verification calls in
   `cache.getOrCompute` with sensible TTLs (pincode/GI data rarely change) to cut repeat fees.
5. **Redis at scale** — swap the in-memory cache for Redis so multiple instances share one cache
   (higher hit rate, lower spend).

## Rough effect
- Local-first + response cache typically means **only a minority of user messages ever reach a
  paid LLM call**; the rest are free.
- Prompt caching + model routing + batch can cut the *remaining* AI bill by well over half.
- Net: a pilot's realistic AI run-rate stays in the **~₹500–2,500/month** range, capped hard at
  ₹30k by `productionGuard`'s spend limit.

## Watch it
`GET /api/cache/stats` shows your hit rate. A healthy hit rate on repeat traffic (FAQs, common
creative prompts) is the signal that caching is doing its job — the higher it climbs, the lower
your per-user cost.
