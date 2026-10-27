---
id: trg-backfills
title: Backfills: run a schedule for each day of a past range
summary: Pick the dates and the period, see what will run and what it may cost, start it, and follow, pause or retry it.
section: Past periods
who: Anyone who may run the schedule; the cost estimate is shown to workspace administrators
where: Build › Pipelines › Schedules & triggers › a schedule's ⋮ › Backfill… (/pipelines/schedules); Run & review › Runs › Backfills (/runs/backfills)
related: trg-run-now, trg-schedules, pl-placeholders, trg-api
popular: Rerun a pipeline for last month
---
A **backfill** runs a schedule once for each day (hour or week) of a past range, a few at a time: to fill the history a
new pipeline missed, or to rebuild a month after a fix. Each run is told which period it is for, so the pipeline reads
that period's data.

## Make the pipeline period-aware

A backfill run gives its period to the steps as `{{run.date}}` (the day), `{{run.windowStart}}` and
`{{run.windowEnd}}`. Use them where the pipeline chooses its data, for example a **Read S3** prefix of
`remits/{{run.date}}/` or a **Read Database** query `WHERE ordered_at >= '{{run.windowStart}}'`. A pipeline that only
reads "today" gives every period the same data.

## Start a backfill

1. Open **Build › Pipelines › Schedules & triggers**, open the schedule's **⋮** menu and choose **Backfill…** (or
   **Backfill…** at the top of the schedule's editor). The schedule must be active.
2. Under **Range**, pick the **Dates** (**7 days**, **30 days**, or a range), and **One run per**: **Day**, **Hour** or
   **Week**. Days are counted in the workspace's billing time zone.
3. Under **How it runs**, choose **At once**: how many of its runs are in flight together (1 to 4). The schedule's own
   runs keep going beside them.
4. Tick **Run again the periods that already have a completed run**, or leave it off to skip them.
5. If the pipeline has run parameters, set their values under **Parameters**: every run of the backfill takes them.
6. Read the **Preview**: how many periods **will run**, how many are **already done, skipped**, each period's date, and
   the **Cost estimate** (from what this pipeline's runs were billed in the last 30 days).
7. Choose **Start** (it reads, for example, **Start: 14 days**). The backfill opens in **Runs › Backfills**.

![A backfill's settings and preview](trg-backfill "Backfill…: the range, one run per day, two at once, the parameters and the preview")

## Follow a backfill

Open **Run & review › Runs › Backfills**. Each backfill shows its schedule, range, periods and how many at once, a bar
of how many are done, failed and running, its status and when it will end. Show **Open**, **All**, **Failed**,
**Completed** or **Cancelled** ones.

On a running backfill you can **Pause** and **Resume**, **Retry failed** periods, or **Cancel** it. The history button
opens the schedule's runs.

![The Backfills page](trg-backfills "Runs › Backfills: each backfill's range, progress and status")

## Example

Summit Valley's revenue cycle team added **Denials by month (backfill a quarter)** in October and needed the earlier
days. They backfilled 1 to 25 October, one run per day, three at once: 25 runs, all completed, each reading that day's
remittance folder with `{{run.date}}`, while the daily runs of other schedules carried on.

## Limits

| What | Limit |
|---|---|
| Periods in one backfill | 366 |
| Runs at once | 1 to 4 (2 by default) |
| Open backfills in a workspace | 3 at a time (the platform may set another number) |
| Runs of a backfill | Billed like any run |
