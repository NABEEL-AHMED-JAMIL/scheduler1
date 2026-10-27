---
id: bill-estimates
title: Estimate a backfill's cost
summary: Before a backfill starts, see how many runs it makes and what they should cost, worked out from the schedule's recent runs; afterwards, compare with what was billed.
section: Usage
who: Workspace administrators see the estimate; whoever may run the schedule starts the backfill
where: Build › Pipelines › Schedules & triggers (/pipelines/schedules); Run & review › Runs › Backfills (/runs/backfills)
related: bill-cost, bill-usage
---
A **backfill** runs a schedule once for each day (hour or week) of a past range, a few at a time: catching up a quarter
of files, or redoing a month after a fix. Because it can make many runs at once, the console shows a **cost estimate**
before it starts, and what was billed so far while it runs.

## See the estimate before you start
1. Open **Build › Pipelines › Schedules & triggers**, open the schedule's ⋯ menu and choose **Backfill…** (it is also
   on the schedule's runs and in its editor).
2. Under **Range**, pick the **Dates** (counted in your billing time zone) and **One run per**: **Day**, **Hour** or
   **Week**. Under **How it runs**, pick how many run **At once**.
3. Leave **Run again the periods that already have a completed run** off to skip the periods already done.
4. Read the **Preview**: how many runs **will run**, how many are **already done, skipped**, the periods in all, the
   dates, and any warnings.
5. Read the **Cost estimate**: about how much in all, and the cost of a run on average, with what it is worked out
   from.
6. **Start** (it names the number of periods, for example **Start: 14 days**) begins it; **Cancel** closes the panel
   and starts nothing.

> **Note:** A schedule that is switched off cannot be backfilled: the preview says *The schedule is switched off;
> switch it on to backfill it.*

![A backfill's estimate](bill-backfill "Backfill: the periods, how many run at once, the preview and the cost estimate")

## How the estimate is worked out
The estimate is the average cost of the schedule's runs billed in the last 30 days (or, with none, the pipeline's),
times the number of runs the backfill will make. It reads, for example: *The average of 25 billed run(s) of this
schedule in the last 30 days x 90 run(s).* With no billed run to go by, it says there is nothing to estimate from.

> **Note:** An estimate is not a price. The runs are billed like any run, for what they actually use: a run that reads
> a bigger file, or calls a model more, costs more.

## Compare it with what was billed
1. Open **Run & review › Runs › Backfills** and choose the backfill.
2. Its page shows the **Estimate** it started with, and **Billed so far**: what its runs cost to date, and how many of
   its runs are priced yet. Usage is rolled up every few minutes, so the last runs catch up shortly after they end.

## Example
At Summit Valley Health System, Marcus Owens backfills *Denials by month* over the last quarter: daily periods,
**3** at once. The preview says 90 runs will run, and the estimate is the average of the schedule's recent billed runs
times 90. Jordan Reyes reads it before Marcus starts, and checks **Billed so far** on the backfill's page the next day.
