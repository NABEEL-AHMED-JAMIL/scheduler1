---
id: step-read
title: "Read steps: where the rows come from"
summary: Read CSV/JSON/Parquet, Read S3, Read API, Read Database, Read documents, Read runs and Sample rows.
section: Read and shape
who: A workspace administrator adds steps; Read runs is an administrator's step
where: Build › Pipelines › a pipeline › Steps › Add step (/pipelines/list)
related: step-shape, step-glance, pl-placeholders, trg-file, pl-try, con-databases, doc-approved-data
---
A **Read** step brings rows into the pipeline. Most pipelines start with one; a pipeline may have several (a file and
a reference list to join to it). Each Read step below lists its settings by the names on its panel. Settings left blank
take the default shown.

Unless their panel says otherwise, **Read CSV/JSON/Parquet**, **Read S3**, **Read API** and **Read documents** are tried
three times on a passing error (a busy or briefly unreachable service), and **Read Database** twice.

![The Read S3 step's settings](step-read "Read S3, set to read only the remittance files written since the last run")

## Read CSV/JSON/Parquet

**What it does.** Reads one file from one of the workspace's buckets as rows: CSV, JSON, JSON Lines or Parquet.

**When to use it.** A daily extract, a reference list, a file whose name you know (or can build from the date).

**Settings.**

- **Bucket**: one of the workspace's storage connections, by its alias. Leave **Bucket** and **File** empty to read the
  file the run was started for (a file that arrived in the inbox, or a form's submission).
- **File**: the object's key. Placeholders such as `{{date}}` are filled in.
- **Format**: `auto` (by the key's extension), `csv`, `json`, `jsonl` or `parquet`.
- **CSV delimiter** (`,`), **CSV has a header row** (on; off names the columns c1, c2, …), **JSON rows at** (a dot path
  such as `data.items`; empty for the whole file).
- **At most rows**: stop after this many. **Only these columns**: read only these, in this order; a wide file's other
  cells are never read.

**Example.** Summit Valley's **Bed occupancy by ward** reads `ops/beds/census-{{date}}.csv`: each morning, that day's
census. **General-ledger journal validation** reads the JSON Lines file that arrived in the inbox.

**Limits.** CSV cells arrive as text (later steps convert them). Time limit 600 seconds.

## Read S3

**What it does.** Lists the objects under a prefix of a bucket (one row per object, with its key and size), or reads all
of them as rows.

**When to use it.** A folder that fills up: hourly feed files, recordings, photos. Its list is also what the file steps
(**Transcribe audio**, **Convert file**, **Split pages**) work through, one file each.

**Settings.**

- **Bucket** (required) and **Prefix**: only objects whose keys start with it; placeholders are filled in.
- **Read as**: `list` (one row per object) or a format (`auto`, `csv`, `json`, `jsonl`, `parquet`) to read each object's
  rows, each row with `_source_key`.
- **At most objects**: 100 unless you say.
- **The run's own files first**: a run started for files (an inbox arrival) reads those files instead of the prefix;
  any other run reads the prefix. So one pipeline serves an inbox trigger and a schedule.
- **Which objects**: `all`, or `last_run`: only the objects written since this schedule's last completed run, oldest
  first. A failed run moves nothing on, so its files come again.
- The CSV and JSON settings of **Read CSV/JSON/Parquet** apply when it reads rows.

**Example.** **ADT feed: hourly admissions, discharges and transfers** reads `ops/adt/` with **Which objects** `last_run`,
so each hourly run reads only the new files.

**Limits.** At most 1,000 objects a step. Time limit 600 seconds.

## Read API

**What it does.** Runs one of the workspace's saved API requests and takes its answer as rows.

**When to use it.** A partner's or public API: a FHIR server, a drug recall list, a scheduling system.

**Settings.**

- **API request** (required), **Environment** (none: the collection's default) and **Collection version** (pin to a
  published version; empty for the request as it is now).
- **Variables**: the request's variables by name; run placeholders and `{{column}}` from the first row of the step's
  input are filled in.
- **Rows at**: where the rows are in the answer, as a dot path (`data.items`; `entry[].resource` takes the resource of
  every element). Empty: the pages' items, else the body.
- **Columns**: when set, each row is only these columns, each **From the row at** a dot path (such as
  `valueQuantity.value`) **As column**. A path over one list (`results[].term`) makes a row per item.
- **At most rows**: stop after this many.

**Example.** **Drug recalls (openFDA enforcement, offset paging)** reads the public recall list, page by page, keeping
the product, the reason and the class of each recall.

**Limits.** Paging is the saved request's own. Time limit 300 seconds; tried three times on a passing error.

## Read Database

**What it does.** Runs one read-only query on one of the workspace's database connections and takes its rows.

**When to use it.** Your own systems' data, read in place: orders, encounters, a stock table.

**Settings.**

- **Connection** (required): one of the workspace's database connections.
- **Query** (required): one read-only statement: `SELECT`, `WITH`, `VALUES` or `TABLE`. Placeholders such as
  `{{run.windowStart}}` are filled in.
- **At most rows**: stop after this many.

**Example.** **Pharmacy store orders from the shop database** reads the orders placed since the start of the run's
window every hour.

**Limits.** A query is at most 20,000 characters. Database connections are read-only: no step writes to your database.
Time limit 300 seconds; tried twice.

## Read documents

**What it does.** Reads a document type's documents (their fields, status and approval) as rows: all of them, those
approved since the last run, or those approved in a date range; or the documents whose approval started this run.

**When to use it.** Referrals, lab reports, consent forms: anything read by **Documents** and checked by a reviewer.

**Settings.**

- **Document type**: the type whose documents to read. Empty: the documents whose approval started this run.
- **Documents**: `Approved`, `Review` (waiting in the review queue) and/or `Rejected`; Approved when empty.
- **Which approved documents**: `all`, or `last_run` (only those approved since this schedule's last completed run).
- **Approved from**, **Approved to**: a date (2026-10-01) or date and time; placeholders are filled in. The last day is
  included.
- **One row per row of table**: name a table of the type (such as `line_items`) to get one row per table row, the
  document's own values beside it. Empty: each table as JSON text in one column.
- **Only these columns**, **At most rows**.

**Example.** **Lab result PDFs: one row per test** reads the type **Lab result** since the last run, one row per line of
its results table. **Consent forms by date range** reads from `{{param.from}}` to `{{param.to}}`.

**Limits.** Time limit 900 seconds; tried three times.

## Read runs

**What it does.** Reads a pipeline's runs in this workspace, one row each with its review: status, decision, reviewer,
comment, when, and how long the run and the review took.

**When to use it.** Turnaround boards, model-against-reviewer comparisons, a discharge summary that lists what ran.

**Settings.** **Pipeline** (its id, such as `XRAY_TRIAGE`; empty: this run's own pipeline), **Runs of the last (days)**
(30), **Include runs still queued or running** (off), **At most rows** (10,000, the oldest first; the step warns when
there were more).

**Columns.** run_id, job_id, pipeline_id, attempt, status, message, input_key, input_name, run_date, created_at,
started_at, ended_at, duration_seconds, review_status, review_decision, reviewer_id, reviewer_name, review_comment,
review_reason, review_decided_at, review_wait_minutes.

**Limits.** An administrator's step: runs name their reviewers and carry their comments. At most 3,660 days.

## Sample rows

**What it does.** Rows written in the step itself, each an object of column and value.

**When to use it.** To build and test a pipeline before real data exists; **Test with sample** adds this step for you.
See [Try a pipeline](#pl-try).

**Limits.** At most 1,000 rows. Remove it before the pipeline reads real data.
