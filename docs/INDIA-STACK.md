# NEXUS — Using Indian AI & DPI Giants

Why: data residency (DPDP), Indian-language strength, INR cost, and strong government/investor
optics ("sovereign, India-first"). How: NEXUS keeps every provider behind a **swappable layer**,
so you can adopt an Indian provider without lock-in — and swap out if one wobbles.

## The AI layer is already provider-agnostic ✅
`aiProvider.js` routes the co-founder + creative agents to any provider by env — no code change:
```
AI_PROVIDER=krutrim        # or sarvam | anthropic
AI_API_KEY=...             # server-side only
AI_BASE_URL=... AI_MODEL=... # optional overrides
```
Krutrim/Sarvam use an OpenAI-compatible API; Anthropic uses its own — the layer builds the right
request for each. If no key is set, agents use the built-in local fallback (no outage). Endpoint
`/api/ai/providers` shows the active provider + residency. (10 tests.)

## The players, and what NEXUS uses each for
| Provider | Use in NEXUS | Notes (as of 2026) |
|---|---|---|
| **Ola Krutrim** (LLM + sovereign cloud) | Co-founder/creative LLM in Hindi & Indic langs; optional GPU cloud for hosting | Krutrim-2 12B open-sourced; INR pricing; 22 languages; **data residency in India**. ⚠️ Company is restructuring (layoffs, consumer "Kruti" app offline in 2026) — treat the *cloud/open models* as usable but **don't hard-depend**; keep the abstraction + a fallback. |
| **Sarvam AI** (LLM + voice) | Alternative Indic LLM + speech; strong for voice onboarding | Focused on LLM/voice APIs; part of India's sovereign-LLM push. Good primary or fallback to Krutrim. |
| **Bhashini** (govt language AI) | 13-language translation + ASR/TTS for voice onboarding | Government stack, low/no cost, official — ideal and politically aligned. Already a config seam (`BHASHINI_*`). |
| **Ola Maps** (Krutrim) | Geocoding, places, directions for tourism + logistics + pincode→geo | ~50% cheaper than Google Maps; **free for ONDC startups for 3 years**. NEXUS can swap its Google-Maps links for Ola Maps at deploy. |
| **CtrlS / Indian DCs** | Sovereign hosting if self-hosting models/data | Rated-4 DCs, data-sovereignty for banks/govt. |
| **DPI: Aadhaar/DigiLocker, UPI, ONDC** | KYC, payments, distribution | Already in the plan; the backbone of the trust + reach story. |

## Recommended posture (honest)
1. **Language first, via Bhashini** — it's official, cheap, and government-aligned; the biggest
   real win for your undocumented-artisan users.
2. **LLM: keep Anthropic as the reliable default now, wire Krutrim/Sarvam as swappable** via
   `AI_PROVIDER`. Move Indic-heavy or data-residency-sensitive calls to the Indian provider once
   you've load-tested it — the layer makes this a one-line env change.
3. **Maps: adopt Ola Maps at deploy** (cost + the ONDC free tier) — low-risk, clear savings.
4. **Cloud: don't over-commit early.** Free tiers run the pilot. Consider Krutrim/CtrlS for
   residency only when you have real data volume — and given Krutrim's turbulence, avoid a hard
   dependency until it stabilises.
5. **Positioning: lean into "built on India's sovereign AI + DPI."** It's true (Bhashini, DPI,
   Indian LLM option, data residency) and it strengthens every government and investor conversation.

## The one caution
Indian AI is young and volatile — Krutrim itself is proof (a unicorn now restructuring). The
*strategy* (sovereign, Indic, INR, DPI) is right; the *dependency* must stay loose. NEXUS's
swappable AI layer, Bhashini seam, and env-driven maps mean you get the India-first benefits
without betting the company on any single vendor's survival.
