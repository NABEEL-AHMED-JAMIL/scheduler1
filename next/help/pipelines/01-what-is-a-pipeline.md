---
id: pl-overview
title: What a pipeline is
summary: Steps in order, each reading the step before or a step you name; a run; and what a run leaves behind.
section: Basics
who: Anyone whose page access includes Pipelines can see them; a workspace administrator builds and changes them
where: Build › Pipelines › Pipelines (/pipelines/list)
related: pl-start, pl-builder, pl-settings, trg-run-now, step-glance
aliases: build
---
A pipeline is one unit of work your workspace does again and again: where it reads, what it does to the rows, who
checks them and where the results go. You describe it once as a list of **steps**; every time it runs, the steps run
in that order on that run's data.

A pipeline on its own does nothing. A **schedule** says when it runs: on a timetable, when a file, form, document or
event arrives, or only when someone presses **Run now**. One pipeline can have several schedules.

## Steps run in order

Each step does one job, such as **Read S3**, **Filter**, **Join**, **AI prompt** or **Generate report**. A step reads
rows and passes rows on:

1. The first step reads the pipeline's source, usually a file, an API, a database or approved documents.
2. Every later step reads **the latest output before this step**, unless you choose another earlier step in its
   **Reads** box. A **Join** or **Append** step also names the other steps it brings in.
3. Output steps (**Save File**, **Upload to bucket**, **Generate report**, **Send webhook** and the others) pass the rows
   on unchanged, so a pipeline can write in several places.

The builder groups the steps into stages so a long pipeline stays readable: **Read** (where the rows come from),
**Check**, **Transform**, **AI**, **Review** (the run waits for a person) and **Write** (where the results go).

## The run

A run is one go of the pipeline. While it runs, each step's output is kept as a dataset that the next steps read and
that you can open on the run's page. When the last step finishes the run is **Completed**; if a step fails, what
happens next depends on that step's **If it fails** setting (by default the run fails). A run always uses the version of
the steps that was current when it started, so saving a change never alters a run in progress.

## What a run leaves behind

- **Outputs**: files kept with the run (a CSV, a PDF, a report), objects written to your buckets, and rows sent to other
  systems.
- **Step datasets**: each step's rows, kept for the hours set in the pipeline's **Keep datasets (hours)** (24 unless you
  change it).
- **Items**: when a pipeline works one file, recording or document at a time, the run lists each of them with how it went
  at every step.
- **A review**, when the pipeline's settings ask for one: the results wait until a person approves them.

![The Pipelines list in Summit Valley Health System](pl-list "Build › Pipelines: each pipeline with its steps, schedules, last run and data sensitivity")

## Read the Pipelines list

1. Open **Build › Pipelines**. The **Pipelines** tab lists every pipeline of the workspace.
2. Each row shows **Steps** (how many; **Legacy** for an older pipeline that has none), **Schedules** (how many run it),
   **Last run** with its status, **Data** (its sensitivity, and **Reviewed** when its results wait for a review) and
   **Status**.
3. Use the search box (id, name, topic or pipeline), **Only mine** and the **Table** / **Cards** switch to find one.
4. Open the arrow beside a row to see **Schedules that run this pipeline**, or **Schedule it** when none does.
5. Click the name to open the pipeline. The **⋮** menu has **Edit**, **Duplicate** and **Delete**.

> **Note:** **Delete** is not offered while a schedule still runs the pipeline ("In use"). Move or delete those schedules
> first.

## Example

Summit Valley Health System's **Bed occupancy by ward** reads the day's census file, counts beds and occupied beds per
ward, works out the occupancy percentage, sorts the wards, uploads the result for the bed board and sends a notice when
there were no census rows. Its daily 06:00 schedule runs it; a manager can also press **Run now**.

## Limits

| What | Limit |
|---|---|
| Steps in one pipeline | 50 |
| How long a run's step datasets are kept | 1 to 720 hours (24 by default) |
| Who builds and changes pipelines | A workspace administrator |
| Who sees them | Anyone whose page access includes Pipelines |
