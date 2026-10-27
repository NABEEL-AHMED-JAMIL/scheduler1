---
id: dev-embed
title: Embed a run view in your portal
summary: Show one run's progress, steps, files and review inside your own portal with a signed 15-minute link, framed only by the sites you allow.
section: Use the API
who: Workspace administrators allow the sites; your portal asks for the links with runs:read
where: Administration & billing › Developers › API Clients (/developers/api-clients)
related: dev-clients, dev-runs, dev-portal
---
A **run view** is a page of one run that your own portal can show in a frame, so your users follow their work without
signing in to the console. It shows the run's status and times, its steps, the files it made (each with a download)
and its review, and refreshes itself while the run moves. It has no console menu, needs no sign-in, sends no cookies,
and shows that one run only.

## Allow your portal's site
1. Open **Administration & billing › Developers › API Clients**, open the portal's client's ⋯ menu and choose
   **Change**.
2. Under **Sites that may embed its run views (optional)**, list your portal's origins, one per line, such as
   `https://portal.example.com` or `https://*.example.com`.
3. Choose **Save**. The client's row then says **Run views embed on** those sites.

With no sites listed, a view link still opens on its own in a browser tab, but no page can show it in a frame.

## How the portal shows a run
1. When a user opens a run in your portal, the portal's server asks the API for a **view link** for that run
   (scope `runs:read`).
2. The link lasts 15 minutes, or less if the portal asks for less. The portal puts it in a frame.
3. The page can follow the portal's light or dark look and its accent colour.
4. When the link expires, the page says so and reads nothing more; the portal asks for a new link.

> **Privacy:** The portal's own token never goes to the browser, only the view link. Revoking the API client, or its
> expiry, ends all its links at once.

![A run view's sites](dev-client-change "A client's settings: Sites that may embed its run views")

## What it costs
Asking for a link is one API call. What the page then reads, and the files downloaded from it, are not counted as
calls.

## Limits
| What | Limit |
|---|---|
| A view link | Up to 15 minutes, one run |
| Who may frame it | Only the sites listed on the client |

## Example
Summit Valley Health System's *Partner portal* client lists the portal's development site as a site that may embed its
run views. When a clinic opens a lab result in the portal, the portal asks for a 10-minute view link and shows the run
in a frame beside the patient's record.
