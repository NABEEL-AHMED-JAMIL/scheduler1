---
id: qa-runs
title: "Test area 10: runs, items and retries"
summary: Find and read runs, a run's page and outputs, failures grouped by error, retrying from the failed step, retrying failed items or many runs, comparing runs, and who sees which runs.
section: Run and review
who: Testers; the administrator (A), with R, V and X for access and isolation
where: Run & review › Runs (/runs/latest); Run & review › Runs › Failed (/runs/failed); Run & review › Runs › Analytics (/runs/analytics)
related: run-runs, run-page, run-items, run-schedule-items, run-failures, run-statuses, ts-runs, qa-pipelines
popular: Test a retry from the failed step
---
These checks cover what happens after a run starts: finding it, reading its page and its files, a failure on purpose,
and every way to retry: from the failed step, from the start, only the failed items, or many runs at once. A retry from
the failed step reuses the steps before it, so they are neither run nor billed again.

**Before you start:** the pipeline `QA occupancy` ([QA-07](#qa-pipelines)) and its schedule `QA daily`
([QA-08](#qa-triggers)) with a few runs. A pipeline that works **item by item** (each file or row is an item; the
Recipes chapter builds one), with an input in which one item fails. For the failure checks, change `QA occupancy`'s
first step to **Read CSV/JSON/Parquet** of a file that is not there yet, `qa/beds-today.csv`, and keep that file ready.

Tested by ______ on ______

![Runs › Failed](qa-runs-failed "Runs › Failed: error patterns, most frequent first, then the failed runs with their failing step, error and kind")

## Find and read a run
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-10.01 | Find a run | As A, **Run & review › Runs** (**Latest**): **When** Last 7 days, **Pipeline** `QA occupancy`, **Started by** **Run now** | The numbers beside each filter match the rows listed; each row shows queued, started, ended, the duration, the status and the last message | ☐ Pass ☐ Fail |
| QA-10.02 | Search by number | Type a run number in **Search run id or message** | Only that run is listed | ☐ Pass ☐ Fail |
| QA-10.03 | The run's page | Click the run number | The title names the run with its status; the strip shows **Started**, **Ended**, **Duration**, **Started by**, **Steps**, **Rows in → out** and, for A, **Cost** | ☐ Pass ☐ Fail |
| QA-10.04 | The tab is in the address | Open **Outputs**; copy the address; open it in a new tab | The page opens on **Outputs** | ☐ Pass ☐ Fail |
| QA-10.05 | View a file in place | **Outputs** › the CSV's **View** | It opens as a table; **⋮** offers the download **as CSV, JSON or JSONL** | ☐ Pass ☐ Fail |
| QA-10.06 | The log | **Log**: search a word; filter by level; **Next error** | The lines narrow as you type; **Next error** jumps to an error line, when there is one | ☐ Pass ☐ Fail |
| QA-10.07 | Analytics | **Runs › Analytics**, range 7 days | The runs, failed, success rate and median duration; **Pipeline health** lists `QA occupancy` with its runs and success rate | ☐ Pass ☐ Fail |

## A failure on purpose
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-10.08 | A missing file fails the first step | **Run now** on `QA daily` (reading the missing `qa/beds-today.csv`) | The run is **Failed**; its message names the step and *No object at* the file; **Steps** marks the failed step: *Fix the cause, then retry: the steps before it are not run again.* | ☐ Pass ☐ Fail |
| QA-10.09 | Failed runs, grouped | **Runs › Failed**, **Today** | **Error patterns** lists *No object at …* with how many runs and schedules; picking it lists only those runs; **Kind** reads **Other** or **The data** | ☐ Pass ☐ Fail |
| QA-10.10 | The run's panel | Click the run on **Runs › Failed** | The failing step, the schedule, the attempt, the times and the full error, with **Open the run** and the retry buttons | ☐ Pass ☐ Fail |
| QA-10.11 | Retry from the failed step | Put `qa/beds-today.csv` in place; **Retry from the failed step** | The console says where the retry starts first; the run continues as **Attempt 2** of the same run and completes | ☐ Pass ☐ Fail |
| QA-10.12 | Each attempt is kept | On the run's **Steps**, pick **Attempt 1**, then **Attempt 2** | Attempt 1 shows the failure; in attempt 2 a step not run again says **Reused from attempt 1** | ☐ Pass ☐ Fail |
| QA-10.13 | A retry refused when the pipeline changed before the failed step | Make another run fail at a later step; change a step before it and **Save**; **Retry from the failed step** | Refused, with the reason (the pipeline changed before the failed step); **Run again from the start** is the way | ☐ Pass ☐ Fail |
| QA-10.14 | Retry many runs at once | Make three runs fail; on **Runs › Failed** tick them; **Retry from failed step** | Before you confirm, the panel lists what will be retried and what skipped, each with its reason; each run is retried on its own | ☐ Pass ☐ Fail |

## Items
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-10.15 | The Items view | Run the item-by-item pipeline; open the run's **Items** | The summary counts **Items**, **Done** and **Failed**; the filters **All**, **Done**, **Failed** carry those counts; the failed item reads **Failed at** its step | ☐ Pass ☐ Fail |
| QA-10.16 | Why an item failed | **Open** on the failed item | **Steps for this item** with **Why it failed**; **Data at each step**; steps after the failure say **Not run: an earlier step failed** | ☐ Pass ☐ Fail |
| QA-10.17 | Retry only the failed item | Fix its cause; **Retry this item** (or **Retry failed items (1)**) | Only that item runs again, from the step it failed at; the done items are untouched; the item's **Earlier versions** list *Attempt 2 · Done · current* and *Attempt 1 · Failed · earlier* | ☐ Pass ☐ Fail |
| QA-10.18 | Act on several items | Tick two items; **Export CSV**, then **Download zip** | The CSV holds the two rows; the zip has a folder for each item with its files | ☐ Pass ☐ Fail |
| QA-10.19 | Find an item across runs and compare | The schedule's **Items** tab: **Find an item** by its name; tick **Compare** on two rows | **Compare two runs** shows the item's fields side by side, what changed in the data and what changed in the pipeline between them | ☐ Pass ☐ Fail |

## Who sees which runs
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-10.20 | A reviewer sees the runs asked of them | As R, **Runs › Latest** | R sees R's own schedules' runs and the runs R is asked to review, not A's other runs | ☐ Pass ☐ Fail |
| QA-10.21 | A reviewer cannot retry someone else's run | As R, open a failed run of A's that R may read | No retry is offered, or it is refused: retrying is for the run's owner and the administrators | ☐ Pass ☐ Fail |
| QA-10.22 | A run's cost is for administrators | As R, open a run's page | **Cost** and **What this run cost** are not shown | ☐ Pass ☐ Fail |
| QA-10.23 | A viewer sees only Analytics | As V, open **Runs** | Only the **Analytics** tab; `/runs/latest` is refused | ☐ Pass ☐ Fail |
| QA-10.24 | Masked values stay masked | As a member without access to a sensitive column, open the Items of a run whose data holds one | The value shows **Masked for you** | ☐ Pass ☐ Fail |
| QA-10.25 | Another workspace cannot open the run | As A, copy a run's address; as X, open it | **Run #N of schedule #M does not exist or was deleted.** | ☐ Pass ☐ Fail |

![A run opened from another workspace](qa-isolation-run "Another workspace's administrator follows the link to a run: the run does not exist for them")

## Example
At Summit Valley **Wound photos too dark to measure** first failed with four items failed at the measuring step; with the
right photos in place, **Retry failed items** ran only those four again, as attempt 2, and the run completed. **Compare
two runs and retry in bulk** shows a bulk retry of three failed runs: one retried, two skipped, each with its reason.
