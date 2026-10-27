---
title: Triggers and schedules
chapter: 7
part: Part III · Build
icon: clock
blurb: Run now, on a timetable, or when a file, form, document, event or API call arrives; and backfills of past periods.
paths: /pipelines/schedules, /runs/backfills
sections: Run and schedule | Start on arrival | Past periods
---
A pipeline runs through a schedule. A schedule runs it on a timetable or only when started, and can also start it when a
file arrives in the inbox or a document is approved. Forms, events from your systems, the API and approval workflows
start runs too, and a backfill runs a schedule once for each day of a past range.

## Start here
1. [Run it now](#trg-run-now) — Run now, or Run with… to give one run its own dates and choices. ![](trg-run-with)
2. [Put it on a timetable](#trg-schedules) — Hourly, daily, weekly, monthly or a cron line. ![](trg-schedule)
3. [Start it when a file arrives](#trg-file) — The inbox, File drop, and only new files since the last run. ![](trg-file)
4. [Start it when a document is approved](#trg-document) — Each approved document of a type starts a run. ![](trg-document)
5. [Start it from your own systems](#trg-events) — Event routes and the API. ![](trg-events)
6. [Fill in past periods](#trg-backfills) — A run for each day of a range, the cost estimate first. ![](trg-backfill)

## Questions
### What time zone does a schedule use?
Server time, Chicago, as the editor and its **Next runs** say. A cron line is in Chicago time too. See
[Run a pipeline on a timetable](#trg-schedules).

### Why is Run now greyed out?
The schedule is inactive ("Activate this schedule to run it"), or it already has a run queued or running. See
[Run now and Run with…](#trg-run-now).

### What happens to runs while a schedule is switched off?
They do not happen: slots that pass while it is inactive are recorded as **Missed** and are not replayed when you turn
it back on. To fill the gap, run a [backfill](#trg-backfills). See [Pause, skip or stop a schedule](#trg-schedules--pause-skip-or-stop-a-schedule).

### Can one pipeline run every hour and also when a file arrives?
Yes: give the schedule a timetable and **A file arrives**, and set **Read S3** to read the run's own files first and
only objects since the last run. See [One pipeline for a timetable and the inbox](#trg-file--one-pipeline-for-a-timetable-and-the-inbox).

### Does Run with… change the schedule?
No. The values are for that run only; the next scheduled run takes the defaults. See [Run with…](#trg-run-now--give-one-run-its-own-values-run-with).

### What does a backfill cost?
Its runs are billed like any run. Before you start, the preview estimates the total from what the pipeline's runs were
billed in the last 30 days. See [Backfills](#trg-backfills).

### What if the same API request is sent twice?
With the same `Idempotency-Key` within 24 hours, the platform returns the first run instead of starting another. See
[Start a pipeline from your own systems](#trg-api).

## Related
- pipelines
- runs
- documents
- forms
- developers
- approvals
