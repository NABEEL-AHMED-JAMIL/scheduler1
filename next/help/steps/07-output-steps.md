---
id: step-outputs
title: "Output steps: where the results go"
summary: Save File, Upload to bucket, Generate report, Render PDF, Send Notification and Send webhook; and why Write Database is switched off.
section: Outputs
who: A workspace administrator adds steps; Upload to bucket and Send webhook are administrators' steps
where: Build › Pipelines › a pipeline › Steps › Add step (/pipelines/list)
related: step-check, step-people, pl-placeholders, step-glance
popular: Save a pipeline's results as a file
---
An output step sends the rows somewhere and passes them on unchanged, so a pipeline can keep a file, make a report and
tell people, one step after another. In the builder they are the **Write** stage; the overview strip's **Outputs** part
lists them.

Two of them write one file for all the rows, or one file per row: **Save File** and **Upload to bucket**. With **One
file per row**, each file is named from its row's columns, as in `{{file_stem}}-insight.json`, and **JSON columns**
(columns holding JSON text, such as an AI answer's lists) are written as lists and objects rather than as text.

![The Generate report step's settings](step-outputs "Generate report with a saved template, named after the run's date")

## Save File

**What it does.** Keeps the rows as a CSV, JSON or JSON Lines file with the run, in its outputs.

**Settings.** **File name** (required; letters, digits, `.`, `-` and `_`; placeholders filled in), **Format** (`csv`,
`json` or `jsonl`), **One file per row** (off), **At most files** (100, one file per row), **JSON columns**.

**Example.** **Duplicate patient records** keeps `mpi-unique.csv`; **Care-call insight** keeps
`insights/{{file_stem}}.json`, one per call.

**Limits.** A file name at most 128 characters; at most 1,000 files a step. The file is kept as long as the run's
outputs are.

## Upload to bucket

**What it does.** Writes the rows as a CSV, JSON or JSON Lines object in one of the workspace's buckets, for a dashboard,
another system or a later pipeline.

**Settings.** **Bucket** (required), **Object key** (required; `{{run}}`, `{{date}}`, `{{time}}`, `{{pipeline}}` and the
other placeholders filled in; one file per row: the row's columns too), **Format**, **One file per row**, **At most
files** (100), **JSON columns**.

**Example.** **Bed occupancy by ward** uploads `ops/beds/occupancy.csv` for the bed board each morning.

**Limits.** A row's values cannot add folders to a key. At most 1,000 objects. An administrator's step; tried three
times on a passing error.

## Generate report

**What it does.** Makes a Report Studio report from the rows and keeps its PDF with the run. The report is a version in
**Reports › Library**, approved and signed there like any other report.

**Settings.**

- **Report design**: **Design the report here** (a design made inside this step from the step's own data) or **Use a
  saved template** (a published template of the workspace).
- **Template** and **Version**: **The latest published version**, or a version number to pin.
- **Report name**: placeholders fill from the run (`Reconciliation · {{date}}`), and with one report per row from the
  row's columns. Empty: the design's name and the run.
- **Formats**: **PDF** and/or **HTML**; as the design says when empty. The PDF is kept with the run.
- **Period**: what the report covers, as its `{{report.period}}`.
- **Brand profile**: a published brand profile; the workspace's default when empty.
- **JSON columns**: columns holding JSON text, read as the lists and objects they hold, so a table in the design can show
  them.
- **One report per row** (off): each row its own report and its own version in Reports, named from its columns.
  **Calls at once** and **At most reports** (20) apply.
- **When the checks refuse it**: `FAIL_TASK` (the step fails) or `CONTINUE_WITH_WARNING` (the step completes with no
  report and a warning on the run).

Designing reports, templates, approval and signatures are described in the Report Studio chapter.

**Example.** **Payment reconciliation** makes the "Reconciliation" report from the saved template each morning;
**Patient statements, one per guarantor** makes one statement per guarantor, 18 in all.

**Limits.** At most 200 reports a step. Time limit 900 seconds.

## Render PDF

**What it does.** Prints the rows as a simple PDF report kept with the run. A big table prints its first rows and keeps
the full data as a CSV beside the PDF.

**Settings.** **File name** (required; `.pdf` is added), **Title**, **Header fields** (label and value pairs above the
table), **Columns**, **Page** (`auto` turns the page for more than six columns; `portrait`; `landscape`), **Watermark**
(such as DRAFT), **Report template** (the default layout when empty), **Rows in the PDF** (5,000), **Attach the full
data** (on), and **Sections**: several tables in one report, each with its **Section title**, **Shows** (`table`, or
`statistics` per column: rows, empty, distinct, min, max, sum, mean and the most frequent values), **Rows of** (an earlier
step), **Columns**, **Note**, **Most frequent values** and **Histograms** (numeric columns drawn as ten bins).

**Example.** **ER waiting times: door to doctor** prints one table per triage level and a statistics section with a
histogram of waiting minutes, watermarked INTERNAL, in landscape.

**Limits.** Up to 50,000 rows printed; 20 sections; 10 histograms. For a designed, approved and signed report, use
**Generate report**.

## Send Notification

**What it does.** Sends a notice about the run to people's notification bell.

**Settings.** **Title** (required; `{{rows}}`, `{{pipeline}}`, `{{run}}`, `{{date}}` and the first row's `{{column}}`
filled in), **Message**, **Severity** (`INFO`, `SUCCESS`, `WARNING` or `ERROR`), **To** (`owner`: the schedule's owner;
`admins`; `everyone`; or `users` with **People** chosen by name), **Send** (`always`, `has_rows` or `no_rows`), **Link**
(a console path the notice opens, starting with /).

**Example.** **Bed occupancy by ward** tells the administrators "No census rows for {{date}}" only when the census was
empty (`no_rows`).

**Limits.** At most 500 people. Time limit 120 seconds.

## Send webhook

**What it does.** Posts the rows, or a summary of them, to one of the workspace's registered webhooks: signed, retried
and logged.

**Settings.** **Webhook** (required; an active webhook of this workspace that takes the `run.step.sent` event type, set
up in **Developers › API Clients**), **Send** (`summary`: the row count, the columns and the fields; or `rows`), **Columns**
(for rows), **At most rows** (500; more fails the step, nothing is cut), **Fields** (name and value pairs sent with it),
**Wait for the first try (s)** (10), **Fail unless delivered** (off).

**Example.** **Remote monitoring: readings over threshold** sends each over-threshold reading to the care team's pager
and fails the step if the pager has not taken it within 20 seconds.

**Limits.** At most 5,000 rows; a wait of at most 60 seconds; the webhook is retried in the background either way. An
administrator's step.

## Write Database is switched off

**Write Database** is listed in **Settings › Task Registry**, but it cannot be added to a pipeline: "Writing to a
database is not part of this release: database connections are read-only."

Pipelines read your databases with **Read Database** and never write into them. A mistake in a pipeline, or a model's
draft answer, can then never change a system of record. To get results back into your own systems, use an output that
your systems pick up and check: **Upload to bucket**, **Send webhook**, **Call API** (to an API your system offers), or
the platform's API, from which your systems read a run's results.
