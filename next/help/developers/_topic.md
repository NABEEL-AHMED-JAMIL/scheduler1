---
title: Developers and the API
chapter: 15
part: Part VII · Administer
icon: terminal
blurb: API clients, the sandbox, runs and events from your systems, webhooks and the portal.
paths: /developers/api-clients, /developers/portal
sections: Get access | Use the API | Hear back
---
Your organisation's own systems use the API to start runs, send events, files and form answers, read what runs made
and decide reviews, and webhooks tell them when something happens. A workspace administrator gives each system an API
client with only the scopes it needs; the Developer portal holds the guides and samples for the developers.

## Start here
1. [See what the API is for](#dev-overview) — What your systems can do, and what an administrator sets up. ![](dev-clients)
2. [Try it in the sandbox](#dev-sandbox) — Test keys against sample pipelines, never billed. ![](dev-sandbox)
3. [Make an API client](#dev-clients) — Scopes, limits, IP allowlist, embed sites; copy the secret once. ![](dev-client-change)
4. [Hear back with webhooks](#dev-webhooks) — Subscribe a URL, check the signature, read the delivery log. ![](dev-webhooks)
5. [Hand the portal to your developers](#dev-portal) — Guides, reference and samples in curl, Python and Node.js. ![](dev-portal)

## Questions
### I lost an API client's secret. Can I see it again?
No: a secret is shown once. Make a new one with **New secret** in the client's menu; the old one stops working at
once, so give the new one to the system straight away. See [Change, rotate or revoke](#dev-clients--change-rotate-or-revoke).

### Is testing in the sandbox billed?
No. Nothing a test key does is billed, and its usage never appears on your invoice. See
[The sandbox and test keys](#dev-sandbox).

### A system sent the same request twice. Did it start two runs?
Not if it sent the same **Idempotency-Key**: the second answer is the first run. See
[Send it twice, get one run](#dev-runs--send-it-twice-get-one-run).

### Our receiver was down. Did we miss the webhooks?
No: each delivery is tried again for a day, and **Deliveries** shows each one with **Send again**. A webhook with no
success for 3 days is paused until you resume it. See [Retries and pausing](#dev-webhooks--retries-and-pausing).

### What are the API's limits?
By default 600 calls a minute for each client and 1,200 for the whole workspace, with bursts, and a monthly quota if
your account has one. See [Limits](#dev-clients--limits).

### How do I let a portal show a run?
List the portal's site under **Sites that may embed its run views** on its client; the portal then asks for
15-minute view links. See [Embed a run view](#dev-embed).

### Who may read the Developer portal?
Administrators, and members whose page access names **Developer portal**. See
[Give a developer access](#dev-portal--give-a-developer-access).

## Related
- connections
- triggers
- runs
- billing
- security
