---
id: gl-reference
title: Reference
summary: The menu, the schedule frequencies, the roles and what a run's status means, to look things up.
section: Reference
who: Everyone; what you see in the menu depends on your role and page access
aliases: reference
related: gl-glossary, run-statuses, trg-schedules, gs-who-sees-what
---
The console's menu, the ways a schedule can repeat, the three roles and the run statuses, in one place.

## The menu
The menu is grouped by the job you are doing: get data in, build, run and review, see the results, then
administration and billing. Each entry with several pages opens them as tabs. You see the entries and tabs your role and
your page access open; the table below is the menu as it is for you now.

<!-- widget: menu-map -->

![The menu](gl-menu "The menu of a workspace administrator: Home, then Get data in, Build, Run & review, See results, Administration & billing")

> **Note:** Hiding a page from the menu is a courtesy: the page itself, and the data behind it, are refused to anyone
> who may not open them. See [Who sees what](#gs-who-sees-what).

## Schedule frequencies
A schedule **On a timetable** repeats in one of six ways. Pick it under **How often** on the schedule's page; the
timetable then reads as a sentence, such as "Every 1 day at 02:00, starting 5 Oct 2026".

| How often | Repeats | Also set |
|---|---|---|
| **Minutes** | Every N minutes, from a start time | The start date and time |
| **Hourly** | Every N hours, from a start time | The start date and time |
| **Daily** | Every N days, at a time | The time and start date |
| **Weekly** | Every N weeks, at a time | **On these days**: one or more weekdays |
| **Monthly** | Every N months, at a time | The day of the month, or the start date's day |
| **Advanced (cron)** | When a cron expression says | The expression; the start date and time may be left blank |

![How often on a schedule's page](gl-frequencies "How often: the six frequencies, the timetable as a sentence, and the optional end")

- **Repeat every** (the N) is a whole number, 1 or more.
- **Ends** is optional: the schedule still runs on the day it ends.
- A cron expression has five fields, minute hour day-of-month month day-of-week, and is read in server time (Chicago).
  The field offers three examples:

| Expression | Means |
|---|---|
| `0 3 * * *` | 03:00 every day |
| `*/15 * * * *` | every 15 minutes |
| `30 8 * * 1-5` | 08:30 on weekdays |

> **Tip:** A schedule can also be **Only when started** (from **Run now**, or when a workflow starts it), and either
> kind can add **A file arrives** or **A document is approved** as a way in. See
> [Run a pipeline on a timetable](#trg-schedules).

## Roles
A person's role decides how much they may do, and whether page access applies to them.

| Role | Opens | Can change |
|---|---|---|
| **Workspace member** | The pages on their page access profile (or the workspace's default profile); with no profile and no default, every page; plus any page opened for them alone | Only what those pages allow: running, reviewing, reading |
| **Workspace administrator** | Every page of the workspace; page access does not apply | People, connections, pipelines, policies and settings, and the bills |
| **Platform administrator** | Every workspace (the platform's own team) | Everything; a workspace's data only from inside that workspace |

What a member may open is set under **Administration › Page access**. See [Page access profiles](#adm-access-profiles)
and [Add a person and choose their role](#adm-people).

## Run statuses
Every run has one status. Lists show it as a pill; the run's own page says it in full, as in the second column.

| In lists | On the run's page | Means |
|---|---|---|
| **Queue** | Queued | Due and handed to the engine; not started yet |
| **Start** | Starting | Being picked up; its first step is about to run |
| **Running** | Running | Its steps are running and reporting progress |
| **Completed** | Completed | Finished, and whatever it produced has been written |
| **Failed** | Failed | Stopped with a reason; the page says which step and why, and it can be retried from that step |
| **Interrupted** | Interrupted | Stopped before it finished: cancelled, or it stopped responding |
| **Skip** | Skipped | Passed over on purpose: by a person, or because the schedule's last run was still in flight |
| **Missed** | Missed | Its time passed while nothing was running to take it, so a gap in the history is never silent |

A completed run whose results wait for a person reads **Completed · waiting for review**, then **Completed · approved**
or **Completed · rejected**; a run paused at an Approval step reads **Running · waiting for approval**. See
[Run statuses](#run-statuses).

## Kinds of failure
**Runs › Failed** sorts each failure into one kind, to show where to look:

| Kind | Where to look |
|---|---|
| **The data** | A row, a file or a contract: the data the run was given |
| **A service it called** | Another system, an API or a service the step depends on |
| **Timed out or stopped responding** | A step's time limit, or a slow system |
| **Too large for memory or a limit** | A row, size or call limit |
| **Its settings** | The pipeline's or the step's settings |
| **Rejected by a reviewer** | An Approval step's decision |
| **Closed by a person** | Someone stopped it |
| **Other** | Anything else; read the message |

See [When a run or a step fails](#ts-runs).
