---
id: sec-retention
title: Retention
summary: How long run outputs, logs, files, documents, reports and records are kept, the daily removal pass, previews, confirmation and legal holds.
section: Records and audit
who: Workspace administrators
where: Administration › Data policies › Retention (/administration/data-policies)
related: sec-data-policies, sec-audit, sec-health-data
---
**Retention** sets how long each kind of your workspace's data is kept. Once a day, after 02:00 (Chicago time), a pass removes what is older than its days, in small batches, and records what it removed. Set the days your own record-keeping policy requires.

Retention starts **Off**: nothing is removed and every kind shows **Forever** until you set days and turn it on.

![Retention](sec-retention "Retention: each kind of data, how long it is kept, the last pass, and legal holds")

## The kinds of data
| Data | What it covers |
|---|---|
| **Run outputs and datasets** | The datasets and files each run made, its result records and its AI answers. The run itself and its manifest (names, rows, bytes) stay. |
| **Run logs** | Each run's log lines and its steps' logs. The run, its steps and their counts stay. |
| **Uploaded files** | Files sent in through the API, and their stored copy in the workspace's inbox. |
| **Documents** | Each document's extraction (fields, corrections, decisions, its approved row), its page images and the original file. |
| **Form submissions** | Each submission's answers, its files, and its copy in the inbox. |
| **AI conversations** | AI Assistant conversations and their messages, tool runs and prompt test runs, pinned ones included. |
| **Notifications** | Bell notices, read or not. |
| **Reports** | Report Studio files that a newer version replaced, and frozen data no kept version uses. Each report's current version and every approved or signed version stay. |
| **Analytics copies and cache** | Bounded by the platform: copies kept to 4 GB a workspace and query results for 10 minutes, both rebuilt from your sources. |
| **Audit records** | File downloads and previews, what retention removed, and the policy's own history. Never less than the platform's minimum (2,190 days). |

A run's **working files** are a different thing: how long a run keeps them for its next steps is set per data level under **Keep run files**, or per pipeline (24 hours by default).

## Set retention
1. Open **Administration › Data policies** and scroll to **Retention**.
2. Choose **Edit retention**. Under **Keep for (days)**, type the days for each kind; empty keeps it forever.
3. Tick **Remove data older than its days** to turn retention on.
4. Choose **Preview these days**: **If saved, a pass now removes** shows, for each kind, what a pass would remove with those days. Nothing is removed by a preview.
5. Choose **Save retention**. The next daily pass applies it; **Run now** on the Retention section starts one at once.

**Preview** on the section itself counts what a pass would remove with the days already saved (**Would remove now**).

## Safety catches
- **Needs confirmation**: if a pass would remove more than a set share of one kind in one go, it pauses that kind. **Confirm** (with the count) lets it go ahead.
- **Legal holds**: **Place a hold** on the whole workspace, a pipeline or one run with a reason. While a hold is on, nothing in its scope is removed. **Release** ends it. Placing and releasing are recorded.
- **History** lists every pass: when, how it started, what it removed.
- Issued invoices and billing records are never removed by retention. Files a pipeline delivered to your own storage are yours and stay; their record in the run is marked expired.

## Example
Summit Valley keeps run logs 90 days and notifications 30 days, previews the effect first, and places a legal hold on the "Patient journey" pipeline while a complaint is open, so none of its runs' outputs are removed until the hold is released.
