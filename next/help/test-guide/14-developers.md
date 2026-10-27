---
id: qa-developers
title: "Test area 14: developers and the API"
summary: API clients and their scopes, the sandbox and test keys, starting a run through the API, event routes, webhooks with their signature and redelivery, embedded run views, the result as JSON, PDF, HTML or Markdown, and the Developer portal.
section: Administer
who: Testers with a developer's tool for sending API calls (curl, Postman or similar); A sets up, with R and X for access and isolation
where: Developers › API Clients (/developers/api-clients); Developers › Developer portal (/developers/portal)
related: dev-overview, dev-clients, dev-sandbox, dev-runs, dev-events, dev-webhooks, dev-embed, dev-portal, trg-api, trg-events
---
These checks cover how your own systems reach the workspace: API clients with only the scopes they need, a sandbox with
test keys that never touch real data or the bill, starting and reading runs, events, webhooks and embedded run views.
The calls themselves, with samples to copy, are in the **Developer portal**; follow its **Quickstart** for the exact
requests.

**Before you start:** a tool for sending API calls, a receiver for webhooks reachable at a public `https` address (a
test receiver of your own), and the workspace's sandbox (your account team creates it once). Keep every secret in your
tool's secret store; never paste one into a note or a screenshot.

Tested by ______ on ______

## API clients
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-14.01 | The limits that apply | As A, **Developers › API Clients** | The box above the list shows each client's most (600 calls a minute, burst 100, by default), all clients together, and this month's calls | ☐ Pass ☐ Fail |
| QA-14.02 | Make a client; the secret is shown once | **New API client**: **Name** `QA client`, **Scopes** `pipelines:read`, `runs:read`, `runs:write`; **Make client**; **Copy** both | **API client made** shows the **Client id** and **Client secret**; closing it, the secret is never shown again | ☐ Pass ☐ Fail |
| QA-14.03 | A token, and its scopes | With the tool, exchange the id and secret for a token; list the pipelines; try to send an event | The token works (it lasts 15 minutes); the list answers; the event is refused: the client has no `events:write` | ☐ Pass ☐ Fail |
| QA-14.04 | An IP allowlist refuses other addresses | **Change** the client: **IP allowlist** `10.0.0.0/8`; call again from your own address | The call is refused. Empty the allowlist again | ☐ Pass ☐ Fail |
| QA-14.05 | A new secret ends the old | ⋯ › **New secret**; call with the old secret, then the new | The old secret and its tokens stop working at once; the new one gets a token | ☐ Pass ☐ Fail |
| QA-14.06 | The client's history | ⋯ › **History** | The changes of QA-14.04 and 14.05, by A, with the time | ☐ Pass ☐ Fail |

## The sandbox
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-14.07 | The sandbox is named | **API Clients** › **Sandbox** | The sandbox is named with a **Test** badge; keys there work only in the sandbox | ☐ Pass ☐ Fail |
| QA-14.08 | Make a test key | **New test key**: a **Name**, the same scopes; **Make test key** | Its **Client id** starts with `cl_test_`; the secret is shown once | ☐ Pass ☐ Fail |
| QA-14.09 | A test key cannot reach the real workspace | With the test key, ask for one of the real workspace's pipelines by its id | *Not found*, as another organisation's would be | ☐ Pass ☐ Fail |
| QA-14.10 | Testing in the sandbox is never billed | Start a few sample runs with the test key; open the real workspace's **Billing › Cost & usage** | The real workspace's figures have not moved; the sandbox's own Cost & usage is marked **Sandbox · never billed** (not yet verified end to end) | ☐ Pass ☐ Fail |

![The sandbox on API Clients](qa-sandbox "The Sandbox part of API Clients: the sandbox workspace with its Test badge, and its test keys")

## Runs and events through the API
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-14.11 | Start a run | With `QA client`, start a run of `QA occupancy` (the portal's **Quickstart** shows the request) with an `Idempotency-Key` | The answer names the run; **Runs › Latest** shows it with **Started by** **API** | ☐ Pass ☐ Fail |
| QA-14.12 | Send it twice, get one run | Send the same request with the same `Idempotency-Key` again | The second answer is the first run; no second run starts (not yet verified end to end) | ☐ Pass ☐ Fail |
| QA-14.13 | Read it back | Read the run, its steps, its outputs and its result | Status and times (UTC), each step with its rows, the files by their ids (never a bucket or a path), and at most 100 result rows | ☐ Pass ☐ Fail |
| QA-14.14 | A record that breaks the input contract is refused | Start a pipeline that has an input contract (the pipeline list in the API names it) with a record missing a required field | Refused with each wrong field named; no run starts (not yet verified end to end) | ☐ Pass ☐ Fail |
| QA-14.15 | An event route | As A, **Event routes** › **New event route**: **Event type** `qa.test.created`, **Starts** **A pipeline's run** `QA occupancy`; **Add route**; send that event with a client that has `events:write` | The answer lists what it started; a run starts | ☐ Pass ☐ Fail |
| QA-14.16 | An event without a route is refused | Send an event of type `qa.nobody.listens` | Refused; nothing starts | ☐ Pass ☐ Fail |
| QA-14.17 | Past the limit | Send more calls in a minute than the client's limit (lower it with **Calls a minute** first) | The API answers 429 with how long to wait; nothing is done or billed | ☐ Pass ☐ Fail |

## Webhooks and embedded views
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-14.18 | A private address is refused | **Webhooks** › **New webhook**: **URL** `https://192.168.1.40/hook` | Refused when saved | ☐ Pass ☐ Fail |
| QA-14.19 | Add a webhook | **URL** your receiver's `https` address, **Events** `run.completed` and `run.failed`; **Add webhook**; **Copy** the signing secret | **Webhook added** shows the **Signing secret** once | ☐ Pass ☐ Fail |
| QA-14.20 | A delivery arrives signed | Run `QA occupancy` | The receiver gets a POST with `Webhook-Signature` (`t` and `v1`) and `Webhook-Id`; an HMAC-SHA256 of the time, a dot and the body with the secret matches `v1` | ☐ Pass ☐ Fail |
| QA-14.21 | Retries and the log | Stop the receiver; run again; start the receiver; ⋯ › **Deliveries** | The delivery shows **retrying** attempts, then **delivered**, with **Attempts** and the **Last answer** (not yet verified end to end) | ☐ Pass ☐ Fail |
| QA-14.22 | Send again keeps the id | **Send again** on a delivery | The receiver gets it again with the same `Webhook-Id` | ☐ Pass ☐ Fail |
| QA-14.23 | A new signing secret overlaps | ⋯ › **New secret** › **Make a new secret** | For 24 hours deliveries are signed with both the new and the old secret | ☐ Pass ☐ Fail |
| QA-14.24 | Embed a run view | **Change** `QA client`: **Sites that may embed its run views** your test page's origin; ask the API for a view link of a run (`runs:read`); open it in a frame on that page | The run's status, steps and files show in the frame; the row reads **Run views embed on** that site; a page on another site cannot frame it (not yet verified end to end) | ☐ Pass ☐ Fail |
| QA-14.25 | A view link expires | Ask for a link of 1 minute; wait | After it expires, the page says so and reads nothing more | ☐ Pass ☐ Fail |

## Access, revoking and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-14.26 | The Developer portal needs its page | As R (no **Developer portal** in R's profile), go to `/developers/portal`; then add it to R's profile and try again | Refused first; then R reads the portal (its **Base URL**, **Quickstart**, **API reference**) but cannot make clients | ☐ Pass ☐ Fail |
| QA-14.27 | API Clients are the administrators' | As R, go to `/developers/api-clients` | Refused | ☐ Pass ☐ Fail |
| QA-14.28 | Revoke ends everything | ⋯ › **Revoke** on `QA client`; call with it | The client and its tokens stop working for good; **Show revoked** lists it | ☐ Pass ☐ Fail |
| QA-14.29 | Another workspace's client cannot reach this one | With a client of X's workspace, ask for `QA occupancy` by its id, and for one of its runs | *Not found* for both | ☐ Pass ☐ Fail |

## Result formats
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-14.30 | The result as JSON, the default | With `QA client`, read a completed run's result with no `format` | The rows of its final output, masked, as in QA-14.13 | ☐ Pass ☐ Fail |
| QA-14.31 | A run with a report, as PDF, HTML and Markdown | Read the result of a run whose pipeline has a **Generate report** step with `format=pdf`, `format=html`, then `format=md` | A PDF (the signed one if the report was approved), the report's page, and Markdown whose first line reads **From signed report RPT-… version N** (or **(not signed)**), with its tables and lists, and its pictures and signature as links | ☐ Pass ☐ Fail |
| QA-14.32 | A run without a report | Read a `QA occupancy` run's result with `format=md`, `format=html`, then `format=pdf` | Markdown and HTML hold the result rows as a table, first line **From the result of run …**; the PDF is refused: **no report** | ☐ Pass ☐ Fail |
| QA-14.33 | The format by Accept, and one that is not offered | Read a result with the header `Accept: text/markdown`; then with `format=xlsx` | Markdown; then refused (400) with the allowed formats named: json, pdf, html, md | ☐ Pass ☐ Fail |
| QA-14.34 | Run and wait in a format | Start a short pipeline with `wait=30s&format=md` | Once it ends, the answer is its Markdown, with the run's address in `Location` | ☐ Pass ☐ Fail |
| QA-14.35 | A sensitive pipeline's report stays in the console | Mark a pipeline with a report **sensitive**; run it; read its result as `pdf`, `html` and `md`, then as JSON | Each document is refused (**sensitive files**); the JSON answers with the person's details masked | ☐ Pass ☐ Fail |
| QA-14.36 | A webhook carries the chosen formats | **Change** the webhook of QA-14.19: under **The run's result**, tick **JSON** and **Markdown**; **Save**; run a pipeline | The list shows **run.completed carries the result as JSON, Markdown**; the receiver's `run.completed` has `data.results` with `json` and `md` (its text), and the signature matches | ☐ Pass ☐ Fail |

## Example
At Summit Valley the *Locked-down client* is allowed only from `10.0.0.0/8` and is refused from anywhere else, and
Priya Singh's test key *Summit Valley sandbox key* (`cl_test_…`) works against the sandbox's sample pipeline while the
real workspace's **Cost & usage** does not move.
