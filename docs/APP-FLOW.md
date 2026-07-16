# NEXUS — App Flow

## Buyer flow
Home → choose "I'm a buyer" → Shop (filter by vertical) → Product (provenance, GI badge,
maker story, "visit where it's made" map, related) → Add to cart → Cart → Checkout →
**Order confirmation** (order id, total, maker's payout share) → [live: payment → notifications].

## Maker flow
Home → "I'm an artisan" → Creative Studio (pick vertical incl. sculpture → 4 expert ideas) →
Maker demo (describe product → see payout split) → [live: voice/OTP onboarding → 5 consents →
KYC → first listing (screened) → sale → WhatsApp payout alert].
Rule: **canSell=false until all consents granted** — enforced server-side.

## Institution / government flow
Home → "I'm an institution" → partner page (MoR model, scheme delivery, ONDC/export readiness)
→ contact/MoU → cluster onboarding (SPV of 10+ artisans, e.g., Rajasthan ICDS via GM DICC).

## Founder flow (passcode + backend token)
Cockpit → Daily briefing → ask co-founder (chat: answers, engine pause/stop, set spend cap,
run diagnostics, repair) → HITL queue (approve payout_large / price_change_large / fraud /
contracts) → Go-Live panel → government panel (schemes, open-data, ONDC checklist) →
audit log / monitoring / mlops.

## Order lifecycle (state machine — illegal transitions refused)
created → paid → in_fulfilment → shipped → delivered → settled
   ↘ cancelled          ↘ refunded (from paid/in_fulfilment/shipped/delivered)
Money movement: split at gateway (never held) → HITL gate if large → idempotency guard →
payout → hash-chained audit entry.

## Cross-cutting
Every screen bilingual EN/हिंदी; every risky action → HITL; every state change → audit log;
errors → monitoring (capture + webhook); repeated AI prompts → cache (paid once).
