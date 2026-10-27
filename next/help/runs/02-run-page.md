---
id: run-page
title: A run's page
summary: The run's summary and Next steps, and its tabs Steps, Map, AI answers, Items, Outputs and Log; viewing a PDF, JSON or table; downloading.
section: Items and outputs
who: Anyone who may read the run (see Follow runs); deciding and retrying stay with its owner, the administrators and its reviewers
where: Run & review › Runs (/runs/latest)
related: run-runs, run-items, run-failures, ai-steps, apr-run-review
---
A run's page says everything about one run: what it did step by step, what it made, and what is left for a person to do.
Open it from any list of runs by its number, from a task in Review, or from a notification.

![A run's page, its Steps tab](run-page "A run's page: the header and its links, the summary strip, the tabs, and the Steps table")

## The top of the page
- The **title** names the run and its schedule, with one status, such as *Completed*, *Completed · waiting for review* or
  *Running · waiting for approval* (see [Run statuses](#run-statuses)).
- The links under it: **All runs of this schedule**, the **Pipeline**, the **Dashboards** the run feeds, and, for an
  administrator, **What this run cost**.
- The **summary strip**: **Started**, **Ended**, **Duration**, **Started by** (*By hand*, *Its timetable* or *A trigger*),
  **Steps** done, **Rows in → out** and, for an administrator, its **Cost**. A failed run's message is under it in words.
- **Next steps** appears when the run waits for a person: its review, or an Approval step. Those who may decide approve or
  reject there (see [Review a run's results](#apr-run-review) and [Approval steps inside a run](#apr-approval-steps)).

## The tabs
| Tab | What it shows |
|---|---|
| **Steps** | Each step in order: its status, when it started, how long it took (the slowest is marked), **Rows in → out**, its output and its own log lines |
| **Map** | The run drawn as its steps, sized by time or rows |
| **AI answers** | Each model answer of the run's AI steps, with the prompt, version, time and tokens; only when the pipeline has AI steps |
| **Items** | Each file, document, recording or row the run worked on, one by one; only for a pipeline that works item by item (see [The Items view](#run-items)) |
| **Outputs** | Every file the run kept or wrote, by step |
| **Log** | Every log line: search, filter by level and step, jump to the **Previous error** or **Next error**, copy or download what is shown |

The tab is part of the page's address, so a link to a run's **Outputs** opens on its outputs.

> **Tip:** While a run is still running, the Log follows it, checking every five seconds. **Timing** on the Log shows
> where the run waited between entries.

## View a file, or take it away
1. Open the **Outputs** tab. Files are grouped by the step that made them, with their type, size and where they are kept
   (*With the run · until* a date, or the bucket and folder they were written to).
2. Choose **View** to look at a file in place:
   - a PDF opens in the PDF viewer;
   - a JSON file opens formatted, with a **Table** view one click away;
   - a table (CSV, JSON lines, Excel, Parquet) opens as a table.
3. Choose **Download**, or from **⋮** download a table **as CSV, JSON or JSONL**, **Visualise** it as a chart, or copy its
   bucket path or file name.

On the **Steps** tab, a step's output has its own download button beside it.

![The PDF a run made, open in the viewer](run-outputs-pdf "Outputs › View: the report the run made, in the PDF viewer")

> **Note:** A file kept *with the run* expires after the time the pipeline or the workspace's data policy sets (24 hours
> unless they set another). Once it has expired it shows **Expired** and can no longer be downloaded; files a run wrote to
> your own buckets stay there.

## Example
Run #2042 of *Journey 7 · Wound photo* took 21 seconds: 11 of 11 steps, one photo in and one row out. On **Steps**,
*Vision model: DRAFT description* was the slowest at 15 seconds, and *Wound care approves the measurement* shows
*Approved by Sam Harper*. **Outputs** holds the wound result as JSON in the clinical bucket and the one-page wound report
as a PDF.

## Limits
| What | Limit |
|---|---|
| Rows drawn in the table viewer | 500 (the rest are in the download) |
| Formatted JSON drawn | 200,000 characters (the rest is in the download) |
| Files kept with the run | 24 hours unless the pipeline or the data policy sets another |
