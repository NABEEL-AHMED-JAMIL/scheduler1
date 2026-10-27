---
id: pl-try
title: Try a pipeline before you rely on it
summary: Put sample rows first, check the pipeline with Validate, run it once and read each step's result.
section: Build and try
who: A workspace administrator
where: Build › Pipelines › a pipeline › Steps (/pipelines/list)
related: pl-builder, pl-versions, pl-placeholders, step-read, run-page
popular: Test a pipeline on sample rows
---
Before a pipeline reads real data on a timetable, try it on a few rows you write yourself, let the console check the
whole definition, and run it once to see what every step made. Nothing here changes the data the pipeline will later
read.

## Put sample rows first

1. Open the pipeline's **Steps** tab and choose **Test with sample**.
2. In **Sample rows**, write the rows as a JSON list, each row an object of column and value (text, a number,
   true/false or null). The box starts with two example rows, or with the rows a sample step already holds.
3. Choose **Use these rows**. A **Sample rows** step is put first in the draft (or the existing one is filled) and the
   console checks the pipeline at once.

```Sample rows for a pipeline
[
  { "mrn": "SV-000917", "condition": "heart failure" },
  { "mrn": "SV-000918", "condition": "copd" }
]
```

![The Test with sample dialog](pl-sample "Test with sample: rows the steps run on, in place of the pipeline's source")

> **Warning:** The **Sample rows** step is a real step of the draft. Once the pipeline works, remove it (or put the real
> **Read** step first) before you save the version a schedule will run.

> **Tip:** A **Call API** step's panel shows **What the first call sends** from these sample rows, so you can check the
> request body before any call is made.

## Check the pipeline

Choose **Validate** in the save bar at the foot of the page. The platform checks every step's settings, the keys,
what each step reads and the pipeline's settings, the same checks a save makes.

- "The definition is valid." means it would save and run as written.
- Otherwise the bar says how many problems there are, each step with a problem shows a red **Problems** pill and its
  messages under its name, and a problem with the pipeline's settings shows beside that field.
- A problem the console cannot place on a step is listed at the top of the tab.

## Run it once and read each step

1. Choose **Save & run now** at the top of the page (it reads **Run now** when there is nothing to save). Unsaved changes
   are saved first: a run always runs the saved steps.
2. If no schedule runs the pipeline yet, **Run now** gives it an on-demand schedule (it runs only when started) and runs
   it.
3. A panel opens on the run: each step with its status, how long it took, its rows in and out, the datasets it made
   (their row counts and columns), any error, and **Show log** for its log lines.
4. Open the run's own page (from **Run & review › Runs**) to see each step's rows, the outputs and the items.

> **Note:** A pipeline with more than one schedule asks which one to run.

## Example

Summit Valley's **Synthetic cohort generator check** starts with **Sample rows** (20 synthetic patients), checks them
against the registry contract with **Validate**, and keeps the result with **Save File**. The team builds the real
pipeline on these rows first, then swaps the first step for **Read CSV/JSON/Parquet**.

## Limits

| What | Limit |
|---|---|
| Rows in a Sample rows step | 1,000 |
| Who may run Validate and Save | A workspace administrator |
| Runs started this way | Billed like any run |
