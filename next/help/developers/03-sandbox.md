---
id: dev-sandbox
title: The sandbox and test keys
summary: A workspace of your own to build an integration in, with sample pipelines and test keys that work only there and are never billed.
section: Get access
who: Workspace administrators make test keys; your account team creates the sandbox
where: Administration & billing › Developers › API Clients › Sandbox (/developers/api-clients)
related: dev-clients, dev-runs, dev-portal, bill-not-billed
---
The **sandbox** is a separate workspace, made for yours, where your developers build and test an integration before it
touches your real pipelines. It has sample pipelines and data, behaves exactly like a real workspace (runs, files,
webhooks, events, retries, limits and errors), and nothing done there is billed.

## Get a sandbox
Your account team creates it once, on request. Until then **API Clients** says *No sandbox yet*. Once it exists, the
**Sandbox** part of **API Clients** names it (for example *Summit Valley Health System (sandbox)*), with a **Test**
badge.

## Make a test key
1. Open **Administration & billing › Developers › API Clients** and scroll to **Sandbox**.
2. Choose **New test key**.
3. Give it a **Name** and tick its **Scopes**, as for any client (see [API clients](#dev-clients)).
4. Choose **Make test key**, and copy the **Client id** and the **Client secret**. The secret is shown once.

A test key's client id starts with `cl_test_`. Its list shows each key's **Name**, **Client id**, **Scopes**, **Last
used** and **State**, with **New secret** and revoke in its menu.

![The sandbox](dev-sandbox "Sandbox: the sandbox workspace, its test key, and the way to the quickstart")

## What a test key can reach
- Only the sandbox. Your real workspace's pipelines, runs and files are *not found* to it, as another
  organisation's are. An ordinary key gets no token for the sandbox either.
- The sample pipelines, a sample data contract and a sample event route, listed in the Developer portal's
  **The sandbox** guide.
- Its own rate limits, so testing never uses up your real clients' calls.

Use only made-up records in the sandbox: it is for testing an integration, not for keeping data.

## What it costs
Nothing. **Billing › Cost & usage** in the sandbox prices its usage to show what it would cost, marked **Sandbox ·
never billed**, but it is never drafted or invoiced.

## Going live
When the integration works in the sandbox:
1. Make an ordinary client under **API Clients** with the same scopes.
2. Your developers swap the test key's id and secret for the new ones, and use your real pipelines' ids.
3. Keep the test key for future tests; it never reaches your real data.

## Example
Priya Singh, a developer working with Summit Valley Health System, gets a test key *Summit Valley sandbox key* with
`pipelines:read`, `runs:read` and `runs:write`, follows the portal's **Quickstart** against the sandbox's sample
pipeline, and checks that **Cost & usage** for the real workspace has not moved. Only then does the administrator make
the real *Partner portal* client.
