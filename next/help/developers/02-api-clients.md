---
id: dev-clients
title: API clients
summary: Make one client for each of your systems with only the scopes it needs, its limits, IP allowlist and embed sites; copy the secret once; rotate or revoke it.
section: Get access
who: Workspace administrators
where: Administration & billing › Developers › API Clients (/developers/api-clients)
related: dev-overview, dev-sandbox, dev-embed, dev-portal, bill-usage
popular: Make an API client
---
An **API client** is one of your systems as the API knows it: a name, an id, a secret, the **scopes** it may use and
where it may call from. Make one client for each system, so each can be limited, watched and switched off on its own.

## Make a client
1. Open **Administration & billing › Developers › API Clients** and choose **New API client**.
2. **Name**: what the client is for, for example *Partner portal*.
3. **Expires (optional)**: the client stops working at the end of that day.
4. Tick the **Scopes** it needs, and no more (see the table below).
5. **Calls a minute (optional)** and **Burst (optional)**: a lower limit than the workspace's most, if you want one.
6. **IP allowlist (optional)**: one address or range per line, such as `203.0.113.0/24`. Empty means any address.
7. **Sites that may embed its run views (optional)**: one origin per line, such as `https://portal.example.com`. See
   [Embed a run view](#dev-embed).
8. Choose **Make client**. The console shows **API client made** with the **Client id** and the **Client secret**.
9. **Copy** both into your system's secret store now.

> **Warning:** The secret is shown once. Copy it now: it is not shown again. If it is lost, make a new secret.

> **Privacy:** Never put a secret in code, a ticket, an email or a screenshot. Keep it in your system's secret store.

## The scopes
| Scope | Lets the client |
|---|---|
| `pipelines:read` | Read pipelines |
| `runs:read` | Read runs, steps, outputs and reviews; make view links |
| `runs:write` | Start and retry runs |
| `files:read` | Download files |
| `files:write` | Upload files |
| `reviews:write` | Record your organisation's review decision on a run |
| `forms:read` | Read forms and their submissions |
| `forms:write` | Submit forms |
| `events:write` | Send events |
| `webhooks:manage` | Manage webhook subscriptions and read the list of event types |

## The client list
Each row shows the **Client** (its name and id), its **Scopes**, **Allowed from** (its allowlist, or **Any address**,
and the sites that may embed its run views), its **Limit**, **Calls this month**, **Last used**, **Expires** and
**State**. **Show revoked** adds the clients that were switched off.

![A client's settings](dev-client-change "Changing a client: its scopes, its limits, the IP allowlist and the sites that may embed its run views")

## Change, rotate or revoke
Open a client's ⋯ menu:

- **Change**: its name, expiry, scopes, limits, allowlist and embed sites. Changing the scopes ends its current
  tokens, so the system asks for a new one.
- **New secret**: the current secret stops working at once, and so does every token the client holds. Your system
  needs the new secret before it can ask for another token. Plan it with the system's owner.
- **History**: the changes made to the client, by whom and when.
- **Revoke**: the client and every token it holds stop working now, for good. To connect that system again, make a new
  client.

## Limits
The box above the list shows the limits that apply:

| What | Limit |
|---|---|
| Each client | At most 600 calls a minute, bursts of 100, unless your account says otherwise |
| All the workspace's clients together | 1,200 calls a minute, bursts of 200 |
| This month | The calls so far and the monthly quota, if your account has one |

Past a limit the API answers *429* with how long to wait, and nothing is done or billed. API calls are billed per
1,000 (see [How usage is counted](#bill-usage)). Our team sets the workspace's limits; ask your account team to change
them.

> **Note:** In a managed workspace, our team sets each client's limits and embed sites too.

## Example
Summit Valley Health System has five clients: *Journey orchestrator* (pipelines, runs, events), *Northgate Labs* and
*HomeLink devices* (events only), *Partner portal* (runs, files, forms, reviews and webhooks, with its run views
embedded on the portal's site), and *Locked-down client*, allowed only from `10.0.0.0/8`, which is refused from
anywhere else.
