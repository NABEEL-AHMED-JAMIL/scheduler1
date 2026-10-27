---
title: Runs and the Items view
chapter: 11
part: Part V · Run and review
icon: history
blurb: Follow runs, open each item, see the outputs and retry what failed.
paths: /runs
sections: Follow runs | Items and outputs | When something fails
---
Every time a pipeline runs, the console keeps a record: its steps, its items, what it made and what went wrong.
Runs lists them by schedule, by date, by how they measure up and by how they failed; a run's page and its Items view show
each one in full, and a failed run is retried from the step that failed, or only for the items that failed.

## Start here
1. [Find a run](#run-runs) — Runs › Latest, narrowed by when, status, pipeline and what started it. ![](run-latest)
2. [Read a run's page](#run-page) — Steps, Map, AI answers, Items, Outputs and Log. ![](run-page)
3. [Open one item](#run-items) — An item's steps, data and files; act on many at once. ![](run-item-panel)
4. [Fix what failed](#run-failures) — Failed runs grouped by error; retry from the failed step or only the failed items. ![](run-failed)
5. [Compare two runs](#run-schedule-items) — Find an item across a schedule's runs and compare two of them. ![](run-schedule-items)

## Questions
### Why is a run Completed but marked waiting for review?
Its pipeline holds its results until a person approves them. Decide it in **Review**. See
[Run statuses](#run-statuses).

### Can I retry only the items that failed?
Yes. On the run's **Items** tab, **Retry failed items** runs only the failed ones again, each from the step it failed at.
See [When something fails](#run-failures--retry-only-the-failed-items).

### Does a retry run everything again?
No. **Retry from the failed step** reuses the steps before it. Only **Run again from the start** runs every step again, and
is billed again. See [When something fails](#run-failures--retry-a-run).

### Why was my Run now refused?
A schedule runs one run at a time: while its last run is in flight, another is refused. See
[Runs at once and big data](#run-at-once).

### How long are a run's files kept?
Files kept with the run expire after 24 hours unless the pipeline or the data policy sets another time; files written to
your own buckets stay there. See [A run's page](#run-page--view-a-file-or-take-it-away).

### Why can't I see a colleague's runs?
A member sees the runs of their own schedules and the runs they are asked to review; administrators see all. See
[Follow runs](#run-runs--who-sees-which-runs).

## Related
- pipelines
- triggers
- approvals
- troubleshooting
- settings
