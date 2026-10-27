---
id: rcp-backfill
title: Backfill last month, with the cost estimate first
summary: Make a daily denials pipeline period-aware with {{run.date}}, give it one billed run, read the backfill's preview and estimate for September, start it three at a time and check the 30 runs.
section: Building blocks
who: Anyone who may run the schedule starts a backfill; a workspace administrator sees the cost estimate and builds the pipeline
where: Build › Pipelines › Schedules & triggers › a schedule's ⋮ › Backfill… (/pipelines/schedules); Run & review › Runs › Backfills (/runs/backfills)
related: trg-backfills, bill-estimates, pl-placeholders, rcp-nightly-new-files, bill-cost
popular: Rerun a pipeline for every day of last month
---
A new daily pipeline only knows about today. A **backfill** runs its schedule once for each day of a past range, a few
at a time, and tells each run which day it is for as `{{run.date}}`. Before it starts, the backfill shows how many runs
it will make and what they should cost, worked out from the schedule's billed runs. This recipe fills September for a
daily count of claim denials.

## What you'll build

- A pipeline, **Denials by day**: **Read CSV/JSON/Parquet** (September's remittances) → **Filter** (denied, on the
  run's day) → **Aggregate** (denials per payer) → **Upload to bucket** (`rcm/denials/{{run.date}}.csv`).
- An active schedule, **Denials by day**, daily at `03:00`.
- One backfill: **1 Sep – 30 Sep 2026**, one run per **Day**, **3** at once: **30** runs and **30** files.

Summit Valley's *Denials by month (backfill a quarter)* is the worked example: backfill #1 ran 25 days of October, three
at once, 25 of 25 completed.

## What you need first

- A storage connection (its alias in **Bucket**; the examples use `summit-valley-s3`).
- The sample file [remits-2026-09.csv](/help/samples/backfill/remits-2026-09.csv): 900 synthetic remittance lines, 30 a
  day for each day of September 2026 (`claim_id`, `payer`, `status`, `paid`, `denial_reason`, `remit_date`). 98 are
  denied.
- Upload it to the folder `remits/` of your bucket (**See results › Analysis › Files**, **New folder**, **Upload**).
- To see the estimate: a workspace administrator's sign-in.

## Build it

### Make the pipeline period-aware

1. **Build › Pipelines** → **New pipeline** → **Add steps yourself**, **Name** `Denials by day`, **Create and add steps**.
2. Add **Read CSV/JSON/Parquet**: **Key** `remits`, **Bucket** your alias, **File** `remits/remits-2026-09.csv`.
3. Add **Filter**: **Key** `denied`, **Keep a row that meets** `all`, two conditions:

| Column | Is | Value |
|---|---|---|
| `status` | `eq` | `denied` |
| `remit_date` | `eq` | `{{run.date}}` |

4. Add **Aggregate**: **Key** `by`, **Group by** `payer`, one aggregation: **Compute** `count`, **As column**
   `denials`.
5. Add **Upload to bucket**: **Key** `keep`, **Bucket** your alias, **Object key** `rcm/denials/{{run.date}}.csv`,
   **Format** `csv`.
6. **Save**.

> **Tip:** `{{run.date}}` is the day a run is for: today for an ordinary run, the period's day in a backfill. A pipeline
> that does not use it gives every period the same data. See [Placeholders](#pl-placeholders).

### Schedule it, and give it one billed run

1. **Schedules & triggers** → **New schedule**: **Schedule name** `Denials by day`, **Pipeline** `Denials by day`,
   **On a timetable**, **Daily**, every `1` day at `03` : `00`. Keep it **Active**. **Create schedule**.
2. On the list, the schedule's **⋮** → **Run now**. Today has no September rows, so the run completes with **Filter**
   `900 → 0`. It is billed like any run, and gives the estimate something to go by.
3. Wait a few minutes: usage is rolled up every few minutes.

### Read the preview, then start

1. On the list, the schedule's **⋮** → **Backfill…**.
2. **Range**: **Dates**, the range picker, **1 Sep 2026** to **30 Sep 2026**. **One run per**: **Day**.
3. **How it runs**: **At once** `3`. Leave **Run again the periods that already have a completed run** off.
4. Read the **Preview**: **30** will run, **0** already done, skipped, **30** days in all, and the 30 dates.
5. Read the **Cost estimate**: the average of the schedule's billed runs in the last 30 days, times 30 runs. Decide
   whether to go on.
6. Choose **Start: 30 days**. The backfill opens in **Run & review › Runs › Backfills**.

![The backfill panel: range, runs at once, preview and estimate](rcp-b-backfill "Backfill…: the dates, one run per day, how many at once, the parameters, the preview of 14 days and the cost estimate")

## Check it worked

1. **Runs › Backfills** shows the backfill: **2026-09-01 to 2026-09-30 · 30 days · 3 at once**, its bar filling, then
   **Completed**, **30 of 30**.
2. Its page shows the **Estimate** it started with and **Billed so far** once the runs are priced.
3. The folder `rcm/denials/` holds **30** files, `2026-09-01.csv` to `2026-09-30.csv`. Together they count all **98**
   denials.
4. `2026-09-15.csv` has **3** rows: Prairie Health Plan (fictional) **2**, Granite Mutual (fictional) **1**, Self-pay
   **1**.
5. `2026-09-12.csv` has no rows: no claim was denied that day. Its run still **Completed**.
6. The schedule's own daily run at 03:00 went on beside the backfill.

![The Backfills page](rcp-b-backfills "Runs › Backfills at Summit Valley: Denials by month, 25 of 25 completed, three at once")

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| **Backfill…** is greyed out, or the preview says *The schedule is switched off* | Only an active schedule is backfilled. **Activate** it first. |
| *Nothing to estimate from* | No run of this schedule (or pipeline) was billed in the last 30 days. Run it once, wait a few minutes, open **Backfill…** again. |
| Every day's file is the same | The pipeline does not use `{{run.date}}`, so each run reads the same rows. |
| Every file is empty | The dates in the file are another format (`09/15/2026` against `2026-09-15`), or the range is not the month in the file. |
| *0 will run, 30 already done, skipped* | Those days already have a completed run. Tick **Run again the periods that already have a completed run** to redo them. |
| A backfill cannot start: too many open | A workspace runs at most 3 open backfills at a time. Wait for one to finish, or cancel one. |
| Some periods failed | Fix the cause, then **Retry failed** on the backfill: only the failed days run again. |

> **Note:** An estimate is not a price. Each run is billed for what it really uses.

> **Note:** Not yet verified end to end: this one-file version was not run at Summit Valley. Its backfill read a folder
> per day (`remits/daily/{{run.date}}/`) instead, and its daily progress pipeline filters on `{{run.date}}` the same
> way as step 3; both backfills completed.
