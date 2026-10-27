---
id: run-runs
title: Follow runs
summary: Runs › Latest, By date, Analytics, Failed and Backfills, what each is for, and who sees which runs.
section: Follow runs
who: Anyone whose page access includes Schedules or Runs by date; Analytics, Failed and Backfills each have their own page access
where: Run & review › Runs (/runs/latest)
related: run-page, run-statuses, run-failures, run-at-once
popular: Find a run and see how it went
---
Every time a pipeline runs, the console records a **run**: when it was queued, started and ended, what started it, its
steps, its items and what it made. **Run & review › Runs** is where you follow them, in five tabs.

![Runs › Latest](run-latest "Run & review › Runs › Latest: narrow the runs on the left; the bars show when they ran")

## The five tabs
| Tab | What it is for |
|---|---|
| **Latest** | Every schedule's newest runs. Narrow them on the left by **When**, **Status**, **Pipeline** and **Started by**; the bars show when they ran |
| **By date** | Every run in a date range (**Today**, **7 days**, **30 days**, **This month**, **Custom**): waiting, running and finished |
| **Analytics** | How the runs measure up: success rate, durations, outcomes by day, and **Pipeline health**, worst first |
| **Failed** | Every failed or timed-out run, grouped by error pattern, with where it failed and why (see [When something fails](#run-failures)) |
| **Backfills** | A schedule run once for each day of a past range, a few at a time, with its progress |

![Runs › By date](run-by-date "Run & review › Runs › By date: every run of the last seven days, with its status counts")

## Find a run
1. Open **Run & review › Runs**. **Latest** opens first.
2. On the left, pick **When** (Today, Since yesterday, Last 7 days, Last 30 days), then tick a **Status**, a **Pipeline** or
   how the run was **Started by** (Schedule, Run now, File arrived, Document approved, Form submitted, Backfill,
   Workflow, Called by a pipeline, API). The numbers beside each say how many runs match.
3. Type a run number or a word of its message in **Search run id or message**.
4. **Charts** shows or hides the bars; **Columns** chooses the table's columns.
5. Click the run number to open the run's page (see [A run's page](#run-page)).

Each row shows the run, its schedule and pipeline, when it was queued, started and ended, the duration, the
[status](#run-statuses), how many items are done (**1 of 1 done**) and the run's last message, such as *11 of 11 step(s)
completed*.

> **Tip:** A schedule's own runs are on the schedule: **Build › Pipelines › Schedules & triggers**, open the schedule and its
> **Runs** tab, beside **Items**. **Ask about this schedule** answers questions such as when it runs next or why it failed.

## Read Analytics
**Run analytics** covers a range (**Today** to **90 days**, or **Custom**) and can be narrowed to some pipelines, schedules,
outcomes or owners. It shows the runs, how many failed, the success rate and the median duration; the **Outcome mix**;
the **Duration spread**; **Runs by day**; and **Pipeline health**: each pipeline with its runs, completed, failed,
interrupted, skipped and missed, its success rate, median and slowest time, and a state such as *Failing* or *Unreliable*.

## Backfills
A backfill runs a schedule once for each day of a past range, a few at a time. Start one from the schedule's **⋮** menu,
**Backfill…**. **Runs › Backfills** lists each with its range, how many at once, its progress (*25 of 25*) and its state;
filter by **Open**, **Failed**, **Completed** or **Cancelled**. The failed days of a backfill are retried from the backfill.

## Who sees which runs
- A workspace administrator sees every run of the workspace.
- A member sees the runs of the schedules that are theirs.
- A reviewer also sees the runs they are asked to review, and the runs whose Approval steps went to them, so the link in
  their task opens the run.
- A viewer whose page access has neither Schedules nor Runs by date sees no runs.

Reading a run is not changing it: retrying, running again and deciding stay with the run's owner and the administrators,
and with the reviewers for their own decisions.

## Example
On a Monday morning, Rosa Alvarez (charge nurse, Ward 4B) opens **Runs › Latest**, ticks **Failed** and the pipeline
*Journey 11 · Daily progress and threshold alerts*, and opens any run that did not complete. Claire Martin (controller)
uses **Analytics** to see which finance pipelines failed this week, such as *Bank statement matching*.
