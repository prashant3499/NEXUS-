# NEXUS — UI/UX Brief

## Brand
Positioning: "craft-rooted fintech" — premium but warm; trustworthy to a government officer,
magical to a diaspora buyer. Logo: interlocking rings (indigo craft × brass tech, gem at union).

## Tokens (do not change names)
Indigo #272247 / #39336A · Brass #A06B2C / #C79A4E · Paper #F3EFE6 · ink/ink2/line.
Serif display (Fraunces/Georgia feel) + clean sans body + Noto Sans Devanagari (Hindi).

## Current system (shipped)
Dark aurora hero (indigo gradient + brass glows, light type, gradient brass CTA) · elevated
cards (layered shadows, hover lift) · CSS 3D depth layer (perspective tilt, reduced-motion safe)
· two-column hero with loom art · brass focus rings · branded scrollbars · order-confirmation
panel · founder passcode gate.

## Priorities (ranked by conversion impact — from the analyst pass)
1. **Real photography replaces emoji products** — faces, hands, workshops, certificates.
   Evidence beats decoration. Single biggest credibility fix.
2. **Mobile-first pass at 360px** — makers are on budget Androids; every flow must work
   one-handed; 44px touch targets.
3. **Maker onboarding = one screen, one action** — voice-first (Bhashini seam), progress dots,
   never two questions at once; Hindi default for maker paths.
4. **Provenance thread component** everywhere: maker → cluster → GI/cert badge → "NEXUS
   protected" (cards, product page, checkout, confirmation).
5. **Trust artifacts for institutions**: DPI logo strip (ONDC/UPI/DigiLocker/GeM), live
   counters (makers verified · payouts made), sober layout, no gimmicks.

## Accessibility & i18n (non-negotiable)
WCAG AA contrast; visible focus; prefers-reduced-motion honored on all 3D/animation;
full EN/HI parity (329/329 keys); Devanagari line-height ≥1.6.

## 3D policy
CSS 3D shipped; WebGL/immersive scenes only via Claude Design with eyes-on iteration
(see CLAUDE-DESIGN-PROMPT.md) — never blind. Performance budget: Lighthouse ≥85 mobile.
