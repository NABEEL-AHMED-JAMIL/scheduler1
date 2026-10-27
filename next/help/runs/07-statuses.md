---
id: run-statuses
title: Run statuses
summary: What Queued, Starting, Running, Completed, Failed, Interrupted, Skipped and Missed mean, and the review and approval words beside them.
section: Follow runs
where: Run & review › Runs (/runs/latest)
related: run-runs, run-failures, apr-run-review, apr-approval-steps
---
Every run has one status. Lists show it as a coloured pill with its own mark, so two statuses of the same colour still look
different; the run's page adds what waits for a person.

## A run's status
| Status | What it means |
|---|---|
| **Queued** | Due and handed to the engine; not started yet |
| **Starting** | Being picked up; its first step is about to run |
| **Running** | Its steps are running and reporting progress |
| **Completed** | Finished, and whatever it produced has been written |
| **Failed** | Stopped with a reason. The run's page says which step and why; it can be retried from that step |
| **Interrupted** | Stopped before it finished: cancelled, or it stopped responding. Counts against the success rate like Failed; run the pipeline again rather than retrying it |
| **Skipped** | Passed over on purpose: by a person, or because the schedule's last run was still in flight |
| **Missed** | Its time went by while nothing was running to take it, so a gap in the history is never silent |

## What waits for a person
The run's page puts what is left after the status:

| Shown as | What it means |
|---|---|
| **Completed · waiting for review** | The run finished; its results wait until someone approves them in **Review** |
| **Completed · approved** | The results were approved and count |
| **Completed · rejected** | The results were rejected; they do not count, and the pipeline can be run again |
| **Running · waiting for approval** | The run is paused at an Approval step until its reviewers decide |

Only a completed run waits for review: a failed run has no results to approve.

## An item's status
In the [Items view](#run-items) each item is **Done**, **Failed** (*Failed at* the step), **Running**, or **Check by hand**
when a step that reads pages was unsure of one.

## Where the statuses are counted
- **Runs › Latest** and **By date** count runs by status; tick one to narrow the list.
- **Runs › Analytics** counts completed, failed, interrupted, skipped and missed for each pipeline, and its success rate.
- **Runs › Failed** lists the failed and timed-out runs, grouped by error (see [When something fails](#run-failures)).
