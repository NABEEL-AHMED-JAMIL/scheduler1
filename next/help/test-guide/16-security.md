---
id: qa-security
title: "Test area 16: security and privacy"
summary: Workspaces kept apart, data policies and the model rules, masking, retention with its preview and legal holds, our team's recorded sessions, and the audit records.
section: Administer
who: Testers; as the administrator (A) and the second workspace's administrator (X), with R and V
where: Administration › Data policies (/administration/data-policies); Administration › Activity (/administration/team-activity); Administration › Page access (/administration/access-profiles); Administration › Sign-in security (/administration/security)
related: sec-data-yours, sec-managed, sec-data-policies, sec-retention, sec-audit, sec-ai, sec-health-data, qa-guide
popular: Test that another workspace cannot see or open anything
---
These checks gather the console's promises about your data. A second workspace can neither see nor open anything of
yours, whatever link it is given. Sensitive data goes only to the models your data policy allows. Retention shows what
it would remove before anything is removed. Our team works in your workspace only in a recorded session. And every
access change, sign-in and decision is recorded where the people who look after it will find it.

**Before you start:** the records made in the earlier areas (a run, a form, a document, a report, a dashboard), and the
addresses of each, copied while signed in as A. X is the administrator of another workspace.

Tested by ______ on ______

## Workspaces are kept apart
Open each address you copied as A, signed in as X. Each line is one check.

| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-16.01 | A run | As X, open A's run address | **Run #N of schedule #M does not exist or was deleted.**; nothing of the run is shown | ☐ Pass ☐ Fail |
| QA-16.02 | A form | As X, open A's form's **Fill in** address | **Form not found.** | ☐ Pass ☐ Fail |
| QA-16.03 | A document | As X, open A's document review address | **This document isn't here** | ☐ Pass ☐ Fail |
| QA-16.04 | A dashboard | As X, open A's board address | **This dashboard isn't here** | ☐ Pass ☐ Fail |
| QA-16.05 | A pipeline | As X, open A's pipeline address | It does not open for X (not yet verified: the exact message) | ☐ Pass ☐ Fail |
| QA-16.06 | A report | As X, open A's report address | It does not open for X (not yet verified: the exact message) | ☐ Pass ☐ Fail |
| QA-16.07 | Searches and lists | As X, search A's pipeline, form, person and file names on X's **Pipelines**, **Forms**, **Users**, **Data Catalog** and **Ask your data** | Nothing of A's is found | ☐ Pass ☐ Fail |
| QA-16.08 | The bell | Make A's run fail; look at X's bell | X gets no notification of A's work | ☐ Pass ☐ Fail |

![A run opened from another workspace](qa-isolation-run "Signed in to another workspace, a link to this workspace's run opens nothing: the run does not exist there")

## Data policies and models
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-16.09 | The defaults | As A, **Administration › Data policies** in a workspace that has not saved its policy | **Not saved yet — these are the defaults**: **Sensitive** **Local only**, **Internal** and **Public** **Any model**; **AI write tools** **Off** for Sensitive, **On** for the others | ☐ Pass ☐ Fail |
| QA-16.10 | Save and undo a level | Change **Keep run files** for Internal to `2`; **Save policy**; then **Use the defaults** on that level | The saved value shows, then the default again | ☐ Pass ☐ Fail |
| QA-16.11 | Sensitive data stays on local models | With a hosted model connection in the workspace, try a prompt marked **Sensitive** on it | Refused: Sensitive is **Local only** (not yet verified end to end) | ☐ Pass ☐ Fail |
| QA-16.12 | The policy can be read by members | As R (with the AI Assistant), open the assistant's **Context** tab | The data policy per level is listed, read only | ☐ Pass ☐ Fail |
| QA-16.13 | Members cannot change it | As R and V, go to `/administration/data-policies` | Refused | ☐ Pass ☐ Fail |

![Data policies](qa-data-policies "Data policies: for each level, which models may see it, how long a run keeps its files, and whether the AI Assistant may change things")

## Retention
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-16.14 | Retention starts off | **Data policies** › **Retention** in a workspace that has not set it | It is **Off**; every kind keeps its data forever | ☐ Pass ☐ Fail |
| QA-16.15 | Preview removes nothing | **Edit retention**: **Keep for (days)** `1` for **Notifications**; tick **Remove data older than its days**; **Preview these days**; then close without saving | **If saved, a pass now removes** shows a count for Notifications; nothing is removed: the bell's older notices are all still there | ☐ Pass ☐ Fail |
| QA-16.16 | Audit records keep a minimum | **Edit retention**: try **Audit records** below the platform's minimum | It is not accepted: audit records are kept at least 2,190 days | ☐ Pass ☐ Fail |
| QA-16.17 | A legal hold | **Place a hold** on `QA occupancy` with a reason; then **Release** it | The hold is listed while it is on; releasing ends it; both are recorded | ☐ Pass ☐ Fail |
| QA-16.18 | The history | **History** on Retention | Every pass with when, how it started and what it removed (or **Not run yet**) | ☐ Pass ☐ Fail |

## Our team's sessions and the audit records
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-16.19 | Our team's activity | As A, **Administration › Activity** (where it appears) | **Our team's activity** lists each change and read by a staff member, with **When**, **Staff member**, **Change or read** (**Read**, **Builder**) and **Service** | ☐ Pass ☐ Fail |
| QA-16.20 | A managed session is recorded | Ask your account team to open a managed session and open one run; then read **Activity** | Their screen carried a bar naming your workspace; the run they opened is listed as a **Read** with their name (not yet verified end to end) | ☐ Pass ☐ Fail |
| QA-16.21 | Who changed someone's access | **Page access** › **Changes** | The grants of [QA-03](#qa-people) with who, what, for whom, until when and why | ☐ Pass ☐ Fail |
| QA-16.22 | Who approved something | Open an approved request of [QA-11](#qa-approvals) | Its history names who decided, when, and their comment | ☐ Pass ☐ Fail |
| QA-16.23 | Who downloaded a report | The report of [QA-12](#qa-reports) › **Activity** | Each download with its time | ☐ Pass ☐ Fail |
| QA-16.24 | A download link is short-lived | Copy a report's download link; open it after five minutes | It no longer works (not yet verified) | ☐ Pass ☐ Fail |

## What the console never does
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-16.25 | It never writes to your databases | See [QA-04.09](#qa-connections), [QA-07.23](#qa-pipelines) and [QA-09.14](#qa-ai) | All three passed: only reading queries run, Write Database cannot be added, and the AI Assistant refuses a database write | ☐ Pass ☐ Fail |
| QA-16.26 | Files delivered to your storage stay | After a run's own files expire, look in the bucket a run wrote to | The files the run wrote to your bucket are still there; only the run's own copies read **Expired** | ☐ Pass ☐ Fail |

## Example
At Summit Valley the Meridian administrator, given a link to run #1881, sees *Run #1881 of schedule #1113 does not exist or
was deleted.*, and a link to the Nurse triage form says *Form not found.* The tester previews a one-day retention
for notifications and closes it without saving: nothing is removed.
