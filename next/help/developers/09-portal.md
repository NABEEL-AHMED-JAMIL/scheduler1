---
id: dev-portal
title: The Developer portal
summary: The API's guides with samples in curl, Python and Node.js, the reference, your clients' scopes, the APIs your pipelines call, the changelog and the downloads.
section: Get access
who: Workspace administrators, and members whose page access names Developer portal
where: Administration & billing › Developers › Developer portal (/developers/portal)
related: dev-overview, dev-clients, dev-sandbox, dev-webhooks
---
The **Developer portal** is the API's documentation inside the console, for the developers who connect your systems.
Every sample in it comes in curl, Python and Node.js. Give your developers access to it rather than copying its
contents elsewhere: it is kept up to date with the API.

## What is in it
| Part | What it holds |
|---|---|
| **Overview** | What the API is for, the **Base URL** to copy, your sandbox, and the **Downloads** |
| **Guides** | Quickstart, The sandbox, Webhooks, Files and file links, Run items, Run and wait, Reports from a pipeline, Idempotency, Paging and filters, Errors, Rate limits and quotas, Embedding a run view |
| **Your API clients** | What each of this workspace's clients may call with its scopes, and a quick start for each |
| **APIs this workspace calls** | The other direction: the saved requests your pipelines and workflows send out, and what each last answered |
| **API reference** | Every call, its scope, parameters, answers and errors, with a curl call to copy; the schemas |
| **Event types**, **Problem types**, **Rate limits** | The events a webhook can hear, the errors the API answers, the limits and their headers |
| **Changelog** | What changed in the API, newest first |
| **Downloads** | The OpenAPI document (YAML and JSON) and a Postman collection |

![The Developer portal](dev-portal "The Developer portal: what the API is for, the guides, the Base URL, the sandbox and the downloads")

## Where to start
1. Read **Quickstart**: a test key, a token, a pipeline, a file, a run and its results, in about ten minutes, in the
   sandbox.
2. Then **Webhooks**, so the system hears back instead of asking.
3. Then **Errors**, **Idempotency** and **Rate limits and quotas**, so the system behaves well when things go wrong.

## Give a developer access
1. A workspace administrator opens **Administration & billing › Administration › Page access**.
2. Adds **Developer portal** to the developer's profile. It is never on by default.
3. The developer sees **Administration & billing › Developers › Developer portal**. Making API clients and test keys
   stays with administrators.

> **Note:** **Your API clients** in the portal shows which calls each client may make with its current scopes, and
> which need a scope it does not have. **Change its scopes** takes an administrator to the client.

## Example
Priya Singh, a developer at Summit Valley Health System, has the **Developer portal** in her profile. She follows the
**Quickstart** against the sandbox, checks under **Your API clients** that *Partner portal* has `files:write`, and
downloads the Postman collection to share with the portal's vendor.
