---
id: rcp-er-waiting-times
title: ER waiting times as a PDF every morning
summary: Work out each emergency visit's door-to-doctor minutes, sum them up by triage level, and print a watermarked PDF with a table and a histogram.
section: Healthcare
who: A workspace administrator builds it; anyone who may read the run opens the PDF
where: Build › Pipelines (/pipelines/list); Build › Pipelines › Schedules & triggers (/pipelines/schedules)
related: step-shape, step-combine, step-outputs, trg-schedules, run-page
---
An emergency department wants to know, each morning, how long patients waited between arriving and seeing a doctor, by
triage level. This recipe reads a visits file, works out the minutes with a formula, groups the visits by triage level
and prints a simple PDF with **Render PDF**: a table per level and the spread of waiting times as a histogram. It
runs on a timetable at 05:00.

> **Note:** The visits are synthetic and the PDF is marked INTERNAL. For a designed, approved and signed report, use
> **Generate report** instead (see [Output steps](#step-outputs--generate-report)).

## What you'll build

A pipeline **ER waiting times: door to doctor** with four steps (read, Compute, Aggregate, Render PDF) and a daily
schedule at 05:00. Each run keeps `er-waiting-times.pdf` in its outputs.

![The PDF step's settings](rcp-x-er-pdf-panel "Render PDF in Summit Valley's ER waiting times: the file name, the title, a header field, the landscape page and the watermark")

## What you need first

1. **A storage connection**, called *your bucket* here (see [Connect your storage](#con-storage)).
2. **The sample file** [visits.csv](/help/samples/er-waiting-times/visits.csv): 300 visits over one week, with
   `visit_id`, `arrived_at`, `seen_at` (both as `2026-10-19T08:15:00`), `triage_level` (1 to 5) and `complaint`.
3. **Put it in your bucket** under a folder `ops/ed/` with **See results › Analysis › Files** (**New folder**, then
   **Upload**; see [Files](#dash-files)). Its key is `ops/ed/visits.csv`.

## Build it

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `ER waiting times: door to doctor`, **Create
   and add steps**.
2. Add these steps in order, each with its **Key**, then **Apply**:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `visits` | **Bucket** your bucket; **File** `ops/ed/visits.csv` |
| 2 | Compute | `wait` | One formula: **Column** `wait_min`, **Formula** as below |
| 3 | Aggregate | `by_level` | **Group by** `triage_level`. **Aggregations**: `avg` of `wait_min` as `avg_wait_min`; `max` of `wait_min` as `max_wait_min`; `count` as `visits` |
| 4 | Render PDF | `pdf` | The settings below |

```The Compute formula: minutes from arrival to the doctor
date_diff(arrived_at, seen_at, 'minute')
```

The **Render PDF** step:

- **File name** `er-waiting-times` (the console adds `.pdf`).
- **Title** `ER door-to-doctor times · {{date}}`.
- **Header fields**: `Source` = `Synthetic ED visits, 300 rows`.
- **Page** `landscape`; **Watermark** `INTERNAL`.
- **Sections**: first **Section title** `By triage level`, **Shows** `table`, **Rows of** `by_level`; then **Section
  title** `Wait statistics`, **Shows** `statistics`, **Rows of** `wait`, **Columns** `wait_min`, **Histograms**
  `wait_min`.

3. **Validate**, then **Save**.
4. Choose **Schedule** at the top of the pipeline's page. **Schedule name** `ER waiting times`, **On a timetable**,
   **How often** **Daily**, every 1 day at `05:00`. Check **Next runs** on the right and choose **Create schedule**
   (see [Run a pipeline on a timetable](#trg-schedules)).
5. To see it now rather than tomorrow, choose **Run now** on the pipeline's page.

## Check it worked

The run is **Completed**, 4 of 4 steps: 300 visits read, 300 rows with `wait_min`, **5** rows after **Aggregate** (one
per triage level), and the PDF. With the sample file the table reads:

| Triage level | Visits | Average wait (min) | Longest wait (min) |
|---|---|---|---|
| 1 | 3 | 4.0 | 6 |
| 2 | 15 | 15.5 | 24 |
| 3 | 130 | 46.6 | 90 |
| 4 | 100 | 83.7 | 149 |
| 5 | 52 | 94.7 | 198 |

The average may show more decimals than here; add `round(...)` around it in a second Compute step if you want
one. Open the run's **Outputs** tab and choose **View** on `er-waiting-times.pdf`: two sections, the second with a
histogram of `wait_min`, the word INTERNAL across each page.

![The run's steps](rcp-x-er-run "Summit Valley's run: 3,000 visits, five triage levels, one PDF")

Summit Valley runs the same pipeline on 3,000 visits; its five rows read, for level 1, 67 visits and an average of
about 3.4 minutes.

## Common mistakes

- **`wait_min` is empty or the step fails.** Both times must be dates with a time, as `2026-10-19T08:15:00`. A time
  written `19/10/2026 08:15` cannot be read; fix the export, or tick **Empty when it cannot be worked out** to leave
  such rows empty.
- **The levels are not in order.** **Aggregate** does not sort its groups. Add a **Sort** step on `triage_level` before
  **Render PDF** to list them 1 to 5.
- **The PDF has one section only.** Each section needs its own **Rows of**: the table reads `by_level`, the statistics
  read `wait` (every visit), not the five summary rows.
- **The schedule runs at the wrong hour.** Schedule times are the server's (Chicago) time, as the editor says.
