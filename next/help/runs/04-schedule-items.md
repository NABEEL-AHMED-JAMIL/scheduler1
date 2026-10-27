---
id: run-schedule-items
title: Find an item across runs, and compare two runs
summary: A schedule's Items tab finds an item or a value in every run, newest first; tick two runs to compare them field by field.
section: Items and outputs
who: Anyone whose page access includes Schedules and who may open the schedule
where: Build › Pipelines › Schedules & triggers (/pipelines/schedules)
related: run-items, run-failures, run-runs
---
The [Items view](#run-items) shows one run's items. A schedule's **Items** tab looks across all its runs: where did this
patient's record go, which runs found *risk = High*, and what changed between yesterday's run and today's.

![A schedule's Items tab](run-schedule-items "A schedule's Items: every run that processed an item, newest first, with its pipeline version and status")

## Find an item
1. Open **Build › Pipelines › Schedules & triggers**, open the schedule, and choose its **Items** tab (beside **Runs**).
2. In **Find an item**, type an item's name or a value, such as `risk = High` or a record number.
3. Pick the dates (**7 days**, **30 days**, **90 days**, **All time** or **Custom**) and, if you want, a status:
   **Done**, **Failed** or **Check by hand**.
4. Each row is one run that processed a matching item: the **Run** and how it started, the **Item**, **When**, the
   **Pipeline version** it ran, its **Status** and the **Report** made for it, if any. Click the item to show only that one.

> **Tip:** From an item's panel in a run, **All runs of this item** opens this list for that item.

## Compare two runs
1. Tick **Compare** on two rows.
2. **Compare two runs** opens below the list: the item's fields side by side, what changed between the two runs, and
   what changed in the pipeline between them, so you can tell a change in the data from a change in the steps.
3. Values masked for you in both runs stay masked; a value that changed only in letter case says so.

![Two runs compared](run-compare "Compare two runs: the item's fields in each run and what changed")

## Compare two attempts of one run
A run that was retried keeps each attempt. On the run's **Steps** tab, pick **Attempt 1**, **Attempt 2** and so on to see
each attempt's steps: a step that was not run again says **Reused from attempt** and the number.

## Example
Marcus Owens (Revenue cycle) wants to know why claim *SVH-1* keeps failing. On *Compare two runs and retry in bulk* he opens
**Items**, finds *SVH-1* in three runs, all *Failed at The partner (503 until fixed)*, and compares the two latest. The
comparison reads *Nothing changed in the data both runs kept* and *Both runs ran pipeline version 1: any change is the
data's, not the pipeline's*. The fault is the partner's service, not the data or the steps.

## Limits
| What | Limit |
|---|---|
| Runs compared at once | Two |
| Which pipelines | Only pipelines that work item by item have items |
