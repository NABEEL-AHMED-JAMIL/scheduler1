---
id: qa-guide
title: How to use this guide
summary: The test accounts you need, synthetic data only, how to record a result and what to do when a check fails.
section: How to test
who: Testers, and the workspace administrators who set up their accounts
where: Administration › Users (/administration/users); Administration › Page access (/administration/access-profiles)
related: qa-sign-in, qa-people, qa-security, gs-who-sees-what, sec-health-data
popular: Prepare the accounts for a manual test
---
This chapter is a checklist for someone who tests the ETL Console by hand, area by area: sign-in, people and access,
connections, documents, forms, pipelines, schedules, AI, runs, reviews, reports, dashboards, the API, billing, security
and settings. You do not need to know how the console is built. Each area is one article; each check is one row of a
table with what to do, what you should see, and a box to tick.

Read this article once before you start. Then work through the areas in order: the later ones use what the earlier ones
made (a connection, a form, a pipeline, a run).

## How a check reads
| Column | What it holds |
|---|---|
| **#** | The check's number, such as **QA-07.03**: area 07, check 03. A number never changes once printed; new checks are added at the end of their area. |
| **Check** | What is being tested, in a few words |
| **Steps** | What to do, in order. Names in **bold** are exactly what the screen shows. "As A" says which test account to sign in as (see below). |
| **Expected** | What you should see. A check passes only when everything in this cell is true. |
| **Pass / Fail** | Tick one box: ☐ Pass or ☐ Fail |

An expected result marked **(not yet verified)** describes a behaviour that is planned or built but has not been seen
working end to end yet. Test it like any other and record what you see: your result is how it becomes verified.

## The test accounts
Ask a workspace administrator to make these accounts before you start (see [Add a person](#adm-people--add-a-person)).
Use them only for testing. In this guide each has a short letter, used in the **Steps** column.

| Letter | Account | Role and access | In the example workspace |
|---|---|---|---|
| **A** | Workspace administrator | **Workspace administrator** | Summit Valley admin |
| **A2** | A second administrator | **Workspace administrator**, a different person: approves what A made, since nobody approves their own work | Jordan Reyes, operations director |
| **R** | Reviewer | **Workspace member** on a profile that opens **Review**, **Runs**, **Forms › Submissions**, **Dashboards** and **Reports**, in at least one team | Dr. Anika Patel (Clinician profile, Physicians team) |
| **V** | Viewer | **Workspace member** on a profile that opens only **Runs › Analytics** and **Dashboards** | Summit Valley viewer (Viewer profile) |
| **F** | Front desk | **Workspace member** on a narrow profile that opens **Forms** and nothing else (made before you start: [Make an access profile](#adm-access-profiles--make-an-access-profile)) | a front-desk clerk on a profile named *Front desk* |
| **RS** | Researcher | **Workspace member** whose profile opens **Analysis** (Ask your data, Analytics Studio, Data Catalog) and **Dashboards** | Dr. Hana Ito (Researcher profile) |
| **X** | Someone in a second workspace | **Workspace administrator** of another workspace, for the isolation checks | the administrator of Meridian Finance & Retail |

> **Tip:** Keep each account in its own browser profile or private window, so you can switch between A, R and V without
> signing out each time.

> **Warning:** Never test as a real person's account, and never as the platform's owner account. Make test accounts.

## Synthetic data only
Every file, form answer, patient, invoice and number you use in a test must be made up. Use the sample files of the
Recipes chapter or your own synthetic ones: names like *Elena Marsh*, record numbers like
`SV-000117`. Never type a real patient's details into a form, a reason box, a pipeline's name or a test value. See
[Working with health data](#sec-health-data).

## Before you start
Run these checks first. If one fails, stop and fix it: the other areas depend on it.

| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-01.01 | Every test account signs in | Sign in as A, A2, R, V, F, RS and X in turn | Each reaches **Home**; the name at the top right is that account's | ☐ Pass ☐ Fail |
| QA-01.02 | The roles are right | As A, open **Administration › Users** and find each test account | A and A2 read **Workspace administrator**; R, V, F and RS read **Workspace member** with the profile given above | ☐ Pass ☐ Fail |
| QA-01.03 | The menus differ by role | Sign in as A, then R, then V, and compare the menus on the left | A sees every group, including **Administration & billing**; R sees **Run & review** and **See results** but neither **Pipelines** nor **Administration & billing**; V sees only **Home**, **Runs** and **Dashboards** | ☐ Pass ☐ Fail |
| QA-01.04 | The second workspace is someone else's | As X, look at the workspace name and the menu | X's pages show X's own workspace; none of A's pipelines, forms or runs is listed anywhere | ☐ Pass ☐ Fail |
| QA-01.05 | The data is synthetic | Look through the files and forms you are about to use | No real person's name, record number, address or card number appears | ☐ Pass ☐ Fail |

## Record a result
1. Tick **☐ Pass** or **☐ Fail** in the last column.
2. Write the date beside the box, on the 24-hour clock if you note a time (2026-10-27 14:05).
3. Write a short note when anything was not exactly as expected, even on a pass: a slow page, a confusing word.
4. At the top of each area, write who tested it and on which day.

```A result line
QA-07.03 · Pass · 2026-10-27 · tested as A in Summit Valley · note: the step took 40 s
```

## When a check fails
1. **Keep what you see.** Do not refresh or retry yet.
2. **Take a screenshot** of the whole window, with the address bar. Do not include a password or a secret.
3. **Note the run.** If the check ran a pipeline, open the run's page (**Run & review › Runs**, then the run number) and
   copy its number and the message under its summary, word for word. The **Steps** tab marks the step that failed; see
   [A run's page](#run-page).
4. **Note the exact message** the screen showed, in quotes, and the time.
5. **Write what you expected and what you saw**, in one line each.
6. Then try once more. If it passes the second time, record a **Fail** with the note "passed on a second try": a check that
   fails now and then is still a fault.

```A failure note
QA-10.06 · Fail · 2026-10-27 15:40 · tested as A
Run: #2042 · Message: "Step 3 <report> failed: ..." · Screenshot: qa-10-06.png
Expected: the run retries from step 3. Saw: the retry was refused with "...".
```

> **Note:** A failure is not your fault and never a reason to change the data or the settings to make a check pass. Record
> it as it is.

## Example
A tester at Summit Valley Health System works through this chapter over two days. On day one, signed in as the Summit
Valley admin (A), she does areas 02 to 08; on day two, areas 09 to 18, switching to Dr. Anika Patel (R) for the review
checks and to the viewer (V) for the role checks. One check fails: she keeps the run number and the message, takes a
screenshot, and hands the sheet to the workspace's administrators.
