---
id: dev-overview
title: What the API is for
summary: How your own systems start runs, send events, files and form answers, read results, decide reviews and hear back, and what an administrator sets up for them.
section: Get access
who: Workspace administrators set up access; your developers use the API
where: Administration & billing › Developers › API Clients (/developers/api-clients); Administration & billing › Developers › Developer portal (/developers/portal)
related: dev-clients, dev-sandbox, dev-runs, dev-webhooks, dev-portal
aliases: developers
---
The console is where your people build and run pipelines. The **API** is how your organisation's own systems (a
patient portal, a partner's lab system, a device hub, a finance tool) reach the same workspace without anyone clicking:
they start work, follow it, decide on it, and are told when something happens. It works with any pipeline, any form
and any event type of yours; nothing in it is specific to one kind of data.

## What your systems can do
| They can | How, in a few words |
|---|---|
| Start a run of a pipeline and read it back | Its steps, its outputs, its items and its review: [Start a run and read it back](#dev-runs) |
| Send events | An event of your own type starts the pipeline or workflow you route it to: [Events and event routes](#dev-events) |
| Send files and form answers | Upload a file for a run; submit a form as a person would: [Files and forms](#dev-files-forms) |
| Decide a review | Approve or reject a run's results when the pipeline asks for your decision |
| Hear back | Webhooks POST each event to a URL of yours, signed: [Webhooks](#dev-webhooks) |
| Show a run in their own page | A short-lived view link in a frame: [Embed a run view](#dev-embed) |

## What an administrator sets up
1. One **API client** for each system that calls the API, with only the scopes it needs, under **Administration &
   billing › Developers › API Clients**. See [API clients](#dev-clients).
2. **Test keys** in the **Sandbox** first, so the developers build against sample pipelines that are never billed. See
   [The sandbox](#dev-sandbox).
3. **Event routes** for the event types your systems will send.
4. **Webhooks** for the events your systems want to hear about.
5. The **Developer portal** for your developers: the guides, the reference and samples to copy. See
   [The Developer portal](#dev-portal).

![API Clients](dev-clients "API Clients: the limits, each client with its scopes, where it may call from, its calls this month and its state")

## How a call works
A system exchanges its API client's id and secret for a **token** that lasts 15 minutes, then sends that token with
every call. Every call is checked against the client's **scopes** (what it may do) and its limits. A call that creates
something carries an **Idempotency-Key**, so sending it twice never does the work twice. Errors come back as problem
details that name the field at fault.

> **Note:** The API's address (the **Base URL**) is on the Developer portal's front page, with a button to copy it.

## Who may do what
| Who | May |
|---|---|
| Workspace administrator | Everything on **API Clients**: clients, test keys, event routes and webhooks. In a managed workspace, event routes and webhooks are read-only, and deliveries can still be sent again |
| Administrators, and members whose page access names **Developer portal** | Open the Developer portal |

## Example
Summit Valley Health System's partner lab, *Northgate Labs*, sends each lab result as an event; the event route
*lab.result.created* starts the pipeline that checks it and tells the physicians when a value is critical. The
patient portal, *Partner portal*, starts runs, uploads files, decides reviews and hears back by webhook. Each has its
own API client with only the scopes it needs.
