---
id: sec-data-yours
title: Your data stays yours
summary: How workspaces are kept apart, what our team can see and when, and what the console never does with your data.
section: Your data
who: Everyone; workspace administrators read the records
where: Administration › Activity (/administration/team-activity)
related: sec-managed, sec-audit, sec-data-policies, adm-workspace
---
Your workspace's data belongs to your organisation. The console keeps it apart from every other workspace, opens it to our staff only in a recorded session, and does not write to your own systems.

## Workspaces are kept apart
- Every person belongs to one workspace, and every page, list, search and export reads only that workspace's data.
- The separation is enforced on the server, not only on the screen: a request for another workspace's data is refused, whatever the browser sends.
- Inside the workspace, each member reads only the pages their access opens, and sensitive columns are masked for people without access (see [Data policies](#sec-data-policies)).

## What our team can see, and when
The platform's own administrators look after the service as a whole: the workspaces, their requests, service health and billing. On their own sign-in they see **no** workspace's data: its pipelines, runs, files, documents, reports, forms and connections open only inside the workspace.

To work in your workspace, a staff member must be granted it and then open a **managed session** (**Work in this workspace**). During that session:
- a bar across their screen names your workspace and says every change and every data read is recorded;
- everything they change, and every piece of data they open, export or download, is written to a record you can read on **Administration › Activity** ([Our team's activity](#sec-managed--our-teams-activity));
- they leave with **Exit**, and their session's access ends.

## What the console never does
- It never writes to your databases. A database connection is read-only.
- It does not delete files a pipeline delivered to your own storage: they are yours and stay, even when the run's own copy expires.
- A downloaded report is a signed link that works for five minutes, for the person who asked.

## Where to check
| You want to know | Look at |
|---|---|
| What our staff did in the workspace | **Administration › Activity** |
| Who signed in, and how | **Administration › Sign-in security › Sign-in history** |
| Who changed whose access | **Administration › Page access › Changes** |
| How long each kind of data is kept | **Administration › Data policies › Retention** |

> **Privacy:** Keep real patient data out of a workspace until your organisation has agreed how it will be handled. See [Working with health data](#sec-health-data).
