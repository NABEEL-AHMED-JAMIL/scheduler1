---
id: rcp-nightly-new-files
title: A nightly schedule that reads only new files, and also starts when a file arrives
summary: One pipeline and one schedule for an admissions feed: every night it reads only the files written since its last run, and a file dropped in the inbox starts a run for that file at once.
section: Building blocks
who: A workspace administrator (a pipeline's Upload to bucket step is an administrator's); anyone whose page access includes Schedules & triggers sets the schedule
where: Build › Pipelines (/pipelines/list); Build › Pipelines › Schedules & triggers (/pipelines/schedules); Documents › Intake › File drop (/documents/intake/file-drop)
related: trg-file, trg-schedules, step-read, rcp-form-trigger, rcp-backfill
popular: Read only the new files each night
---
Feeds arrive as many small files: admissions, discharges and transfers every hour, lab results, device readings. You
want each file read once, not every file every night. A **Read S3** step set to read only the objects written since the
schedule's last completed run does that; tick **A file arrives** on the same schedule and a file put in the inbox is
handled at once, between the nightly runs.

## What you'll build

- A pipeline, **ADT feed, nightly**: **Read S3** (new files only) → **Remove duplicates** → **Sort** →
  **Upload to bucket**.
- A schedule, **ADT feed (nightly and inbox)**: **On a timetable**, **Daily** at `02:00`, and **Also starts when** **A
  file arrives** named like `adt-*.csv`.
- Three runs that prove it: the first night reads both files waiting (240 rows, 230 events), the next run reads nothing
  new, and a dropped file starts a run of its own (120 rows).

Summit Valley's *ADT feed: hourly admissions, discharges and transfers* is the same pipeline, read hourly.

## What you need first

- A storage connection (its alias goes in **Bucket**; the examples use `summit-valley-s3`) and the workspace inbox
  (**File drop**, see [The file drop](#doc-file-drop)).
- The sample files, synthetic ADT events (`event_id`, `mrn`, `event_type`, `ward`, `event_time`), 120 rows each:
  - [adt-2026-10-01-a.csv](/help/samples/nightly-new-files/adt-2026-10-01-a.csv)
  - [adt-2026-10-01-b.csv](/help/samples/nightly-new-files/adt-2026-10-01-b.csv): its first 10 events repeat the last
    10 of file a, as feeds often do.
  - [adt-2026-10-02-a.csv](/help/samples/nightly-new-files/adt-2026-10-02-a.csv): the next day, for the File drop.
- Upload the two `2026-10-01` files to the folder `ops/adt/` of your bucket (**See results › Analysis › Files**, **New
  folder**, **Upload**). Keep the third for later.

## Build it

### The pipeline

1. **Build › Pipelines** → **New pipeline** → under **Add steps yourself**, **Name** `ADT feed, nightly`, **Create and
   add steps**.
2. **Add step from the Task Registry…** → **Read S3**:

| Setting | Value |
|---|---|
| **Key** / **Name** | `new` / `ADT files since the last run` |
| **Bucket** | your alias, such as `summit-valley-s3` |
| **Prefix** | `ops/adt/adt-` |
| **Read as** | `csv` |
| **At most objects** | `50` |
| **The run's own files first** | **Yes** (ticked) |
| **Which objects** | `last_run` |
| **CSV has a header row** | on (the default) |

3. Add **Remove duplicates**: **Key** `unique`, **Key columns** `event_id`, **Keep** `first`.
4. Add **Sort**: **Key** `ordered`, **Sort by** `event_time`, `asc`.
5. Add **Upload to bucket**: **Key** `keep`, **Bucket** your alias, **Object key** `ops/adt/clean/{{date}}-{{run}}.csv`,
   **Format** `csv`.
6. **Save**.

![The Read S3 step reading only new files](rcp-b-read-s3 "Summit Valley's ADT feed: Read S3 under ops/adt/adt-, read as csv, at most 50 objects, which objects last_run")

> **Tip:** With **The run's own files first** ticked, a run started by a file reads only that file; any other run reads
> the prefix. That is what lets one pipeline serve both ways in.

### The schedule

1. Open **Build › Pipelines › Schedules & triggers** and choose **New schedule** (or **Schedule** on the pipeline's page).
2. **Schedule name** `ADT feed (nightly and inbox)`, **Pipeline** `ADT feed, nightly`.
3. **When it runs**: **On a timetable**. Under **How often**: **Daily**, every `1` day at `02` : `00`.
4. **Also starts when**: tick **A file arrives**. **Which files** `adt-*.csv`. **Files per run** `1`.
5. **Email me when**: tick **A run fails**.
6. Read **What you will get** on the right: *Every 1 day at 02:00. Also when a file arrives in the inbox matching
   adt-\*.csv*, and the next five runs at 02:00 (server time, Chicago).
7. Leave **Active: runs as soon as it is saved** ticked, and **Create schedule**.

![A daily schedule that also starts when a file arrives](rcp-b-nightly-schedule "New schedule: on a timetable, daily at 02:00, and also when a file named adt-*.csv arrives; the next runs on the right")

## Check it worked

Do not wait for the night: start the first two runs by hand.

1. On the schedules list, the schedule's **⋮** → **Run now**. The run reads both files: **Read S3** `0 → 240`,
   **Remove duplicates** `240 → 230` (the 10 repeated events dropped), **Sort** `230 → 230`, and one file
   `ops/adt/clean/<today>-<run>.csv` with 230 rows.
2. **Run now** again. This run reads only what was written since the first completed: nothing. It completes with
   **Read S3** `0 → 0`, and the later steps run on 0 rows.
3. Open **Documents › Intake › File drop** and drop `adt-2026-10-02-a.csv`. It shows **Uploaded**, and a run of the
   schedule starts by itself, reading only that file: `0 → 120`, `120 → 120`.
4. The next night at 02:00 the timetable run reads anything new under `ops/adt/` and nothing else: the dropped file was
   stored under the inbox's own folder (`intake/<date>/…`), and its run already handled it.

> **Note:** Not yet verified end to end: Summit Valley's inbox-triggered schedules are switched off while the showcase
> is built, so the File drop run (step 3) was not seen there.

At Summit Valley the hourly ADT feed's first run read 24 files (2,880 rows) and kept 2,736 unique events; every hourly
run after it reads only the hour's new file.

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| Every run reads every file again | **Which objects** is `all`. Set it to `last_run`. |
| A file seems to be read twice | Two schedules run the same pipeline: `last_run` counts per schedule. Keep one schedule. |
| After a failed run the same files come again | By design: a failed run moves nothing on, so the next run retries those files. Fix the cause and run again. |
| A dropped file starts nothing | **A file arrives** is not ticked, **Which files** does not match the name (`ADT-…` against `adt-*`: case counts), or the schedule is inactive. |
| The run started by a file read the whole folder | **The run's own files first** is off. |
| **Upload to bucket** cannot be added | It is a workspace administrator's step. |
| The timetable runs at the wrong hour | Schedule times are server time (Chicago), as **Next runs** says. |
