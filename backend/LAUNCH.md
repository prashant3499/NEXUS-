# NEXUS — run on your laptop (plug & play)

## One-time prerequisite
Install **Node.js LTS** from https://nodejs.org  (the only thing you need; the app has zero other dependencies).

## Start it
- **Mac:** double-click **`start.command`**
- **Windows:** double-click **`start.bat`**
- **Linux / any terminal:** `./start.sh`

Your browser opens at **http://localhost:4100**. That's the live platform, running on your laptop.
First run creates a `.env` file in safe **mock mode** — fully testable, no real money.

## When you're ready to connect real services ("give all we needed")
Open `.env`, uncomment and fill the PRODUCTION block (same items as the cockpit's **Go-Live Control** panel):
payments (Razorpay), database (Postgres), AI (Anthropic), voice (Bhashini), secrets, and finally
`COMPLIANCE_CONFIRMED=true` **only after your lawyer + CA sign off**. Restart the launcher — it switches to real mode.

## How sourcing & consent work (your flow, already built in)
1. **Auto-source first** → makers enter the database as **prospects** (stage: sourced). Nothing is listed or sold.
2. **Consent, then upload** → a maker's products are only listed/sold after they grant the 5 required consents
   (terms, selling-authorization, content-license, data-processing, payout-authorization). The `canSell` gate enforces this.

So you can build the prospect database widely, but the platform will not transact for anyone who hasn't said yes.
