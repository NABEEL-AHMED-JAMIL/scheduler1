---
id: run-failures
title: When something fails
summary: The message in words, Runs › Failed grouped by error, retry from the failed step, retry only the failed items, retry several runs at once.
section: When something fails
who: Anyone whose page access includes Runs › Failed reads it; retrying is for the run's owner and the workspace administrators
where: Run & review › Runs › Failed (/runs/failed)
related: run-items, run-schedule-items, run-statuses, run-page, run-runs
popular: Retry only the failed items of a run
---
A run that fails stops with a reason. The console says which step failed and why, in words, and lets you retry from that
step once the cause is fixed: the steps before it are not run again.

## Read why it failed
- The run's page shows the message under its summary, and the **Steps** tab marks the failed step: *Fix the cause, then
  retry: the steps before it are not run again.*
- For a pipeline that works item by item, the **Items** tab shows which items failed and at which step; open one for
  **Why it failed** (see [The Items view](#run-items)).
- **Run & review › Runs › Failed** lists every failed or timed-out run in a range, with its **Failing step**, its
  **Error** and its **Kind**.

![Runs › Failed](run-failed "Runs › Failed: the error patterns, most frequent first, above the failed runs")

## Failed runs, grouped by error
1. Open **Run & review › Runs › Failed** and pick a range (**Today**, **7 days**, **30 days**, **This month**, **Custom**).
2. **Error patterns** groups the same error with its numbers, names and ids set aside, most frequent first, with how many
   schedules it touched and when it was first and last seen. Pick a pattern to list only its runs.
3. Narrow the list on the left by **Pipeline**, **Schedule**, **Failing step**, **Error kind** or **Day**. The kinds say
   where to look: *The data*, *A service it called*, *Too large for memory or a limit*, *Rejected by a reviewer*, *Other*.
4. Click a run for its panel: the failing step, the schedule, the attempt, the times and the error in full, with
   **Open the run** and the retry buttons.

![A failed run's panel](run-failed-panel "A failed run's panel: where it failed, why, and how to retry it")

## Retry a run
- **Retry from the failed step**: the steps before it are reused (**Steps reused**) and the run goes on from where it
  stopped, as a new attempt of the same run.
- **Run again from the start**: every step runs again on the pipeline as it is now, and its work is billed again.

Before anything happens, the console reads what a retry would do and says where it would start. A retry can be refused,
with the reason: the pipeline changed before the failed step (run it again from the start), an input file changed since
the run read it, the kept outputs of the steps before it expired, another run of the pipeline is in flight, or the run is
part of a backfill (retry its failed days from **Runs › Backfills**).

> **Note:** A run that stopped responding is closed as *Interrupted*, not failed: run its pipeline again rather than
> retrying it.

## Retry only the failed items
On the run's **Items** tab, **Retry failed items (N)** runs only the failed items again, each from the step it failed at.
The items that are done are left as they are, and a report already made for one is kept. To retry some of them, tick them
and choose **Retry N failed** in the bar.

![A run whose items all failed at one step](run-failed-items "A run's Items tab: 30 items failed at the eligibility call, with Retry failed items")

## Retry several runs at once
1. On **Runs › Failed**, tick the runs (or the page).
2. Choose **Retry from failed step** in the bar.
3. The panel lists what will be retried and what will be skipped, with each reason, before you confirm. Each run is retried
   on its own, as if one by one.

## Compare two attempts
A retried run keeps each attempt. On its **Steps** tab, pick **Attempt 1** or **Attempt 2** to see what each did; a step
that was not run again says **Reused from attempt 1**. To compare two runs item by item, use the schedule's **Items** tab
([Find an item across runs, and compare two runs](#run-schedule-items)).

## Example
The census file for 12 October arrived late, so that day's backfill run of *Late census feed alert* failed at its first step:
*No object at summit-valley-s3/ops/beds/late/census-2026-10-12.csv*. The alert rule told the IT team. When the file arrived,
the administrator retried the failed day from **Runs › Backfills**, and the run completed.

## Limits
| What | Limit |
|---|---|
| Runs retried in one bulk retry | 100 |
| Who may retry | The run's owner and the workspace administrators |
| A backfill's runs | Retried from the backfill, not one by one |
