---
id: step-glance
title: Every step at a glance
summary: One table of every step, its main settings, its defaults and its limits, and the settings every step shares.
section: At a glance
who: Anyone who builds or reads pipelines
where: Build › Pipelines › a pipeline › Steps (/pipelines/list); Settings › Task Registry (/settings/task-registry)
related: step-read, step-shape, step-combine, step-check, step-ai, step-people, step-outputs, pl-builder
---
This page is the short form of the step reference: every step the console's **Add step** offers, grouped as in this
chapter. The full settings, with examples, are in each group's article. **Settings › Task Registry** lists the same
steps for your workspace, with how many pipelines use each and whether it is on.

![The Task Registry](step-registry "Settings › Task Registry: every step task, its kind, what it reads and makes, and whether it is on in this workspace")

## Settings every step has

| Setting | What it does | When blank |
|---|---|---|
| **Key** | Names the step's rows; what a later step reads | Required |
| **Name** | What the run's timeline calls it | The key |
| **Reads** | The output it works on | The latest output before this step |
| **Tries** | How many times it is tried; 1 to 10 | The step's own default (below), else 1 |
| **Seconds between tries** | 0 to 3,600 | The step's own default |
| **Timeout (seconds)** | Each try's time limit, 1 to 86,400 | The step's own (below), else the pipeline's default timeout (600) |
| **If it fails** | **Fail the run**, **Continue with the next step** or **Skip the rest and complete** | The pipeline's **If a step fails** |

A step that only reads or works on rows, and an output that writes the same thing again on a repeat (Save File, Upload
to bucket, Generate report, Render PDF), is also tried again by itself on a passing error when you set no tries.

## Read

| Step | Main settings | Defaults | Limits |
|---|---|---|---|
| Read CSV/JSON/Parquet | Bucket, File, Format, CSV and JSON options, Only these columns | Format auto; 3 tries; 600 s | Empty bucket and file: the run's own file |
| Read S3 | Bucket, Prefix, Read as, The run's own files first, Which objects | list; 100 objects; all; 3 tries; 600 s | 1,000 objects |
| Read API | API request, Environment, Variables, Rows at, Columns | 3 tries; 300 s | 100 columns |
| Read Database | Connection, Query, At most rows | 2 tries; 300 s | One read-only statement, 20,000 characters |
| Read documents | Document type, Documents, Which approved documents, Approved from/to, One row per row of table | Approved; all; 3 tries; 900 s | |
| Read runs | Pipeline, Runs of the last (days), Include runs still queued or running | 30 days; 10,000 rows | Administrators only; 3,660 days |
| Sample rows | Rows | | 1,000 rows |

## Shape

| Step | Main settings | Defaults | Limits |
|---|---|---|---|
| Select columns | Columns (or old and new names), Fail on a missing column | Off | |
| Filter | Keep a row that meets, Conditions | all | 50 conditions, 1,000 values in a list |
| Transform | Mappings (copy, constant, concat, upper, lower, trim, cast, coalesce, replace), Keep the other columns | copy; off | 200 mappings |
| Compute | Formulas, Empty when it cannot be worked out | Off | 50 formulas, 1,000 characters each |
| Fill missing values | Columns to fill (value or previous), Blank text is empty | value; on | 100 columns |
| Split column | Column, Separator, Into, New columns, Trim spaces, Keep the column, Skip empty parts | `,`; columns; on; off; on | 50 new columns |
| Remove duplicates | Key columns, Keep, Ignore case | Every column; first; off | 1,800 s |
| Sort | Sort by (column, direction, empty values) | asc; empty last | 10 columns; 1,800 s |
| Limit / top N | Rows to keep, Skip first, Top N by | 0 skipped | |

## Combine

| Step | Main settings | Defaults | Limits |
|---|---|---|---|
| Join | Join with, On, Keep, Prefix for clashing columns | inner; `right_` | 10 key pairs |
| Append (union) | Steps to stack, Columns, Source column, Column types | all; convert on | 2 to 20 steps |
| Aggregate | Group by, Aggregations | One group for all | 20 group columns, 50 aggregations |
| Pivot (rows to columns) | Row per, Names from, Values from, When a group has several, Only these | first | 200 columns; 1,800 s |
| Unpivot (columns to rows) | Columns to turn into rows, Name column, Value column, Keep empty values | name; value; off | 200 columns |
| Run pipeline | Pipeline, Call, Parameters, Answer from, Fields | once; final; 20 calls; 10,000 rows; 3,600 s | Administrators only; 100 calls; 3 deep |

## Check and enrich

| Step | Main settings | Defaults | Limits |
|---|---|---|---|
| Validate | Contract (or Contract name), Contract version, Rows that do not hold | Active version; fail; 2 tries; 300 s | |
| Enrich | API request, Variables, Fields, When a call fails | fail; 100 calls; 1,800 s | 500 calls |
| Call API | API request, Send, Columns sent, Variables, Fields, Ok only when, When a call is not ok, A file from an earlier step | each; 50 rows per call; fail; `api_`; 1 at once; 100 calls; 1,800 s | Administrators only; 500 calls; 1,000 rows per call; 8 at once |

## AI and media

| Step | Main settings | Defaults | Limits |
|---|---|---|---|
| AI prompt | Prompt, Variables, Image, Answer column, Fields, When a row fails | `ai_output`; fail; 1 at once; 50 rows; 3,600 s | 500 rows; 8 at once; image 8 MB |
| Transcribe audio | Bucket, File key column, Timestamps, When a file fails | Off; fail; 1 at once; 20 files; 7,200 s | 1,000 files; 500 MB a recording |
| Convert file | Bucket, File key column, Convert to, Write the result to, Output key | pdf; bucket; 20 files; 3,600 s | 1,000 files; 500 MB a file |
| Split pages | Bucket, File key column, Image resolution, A page needs at least characters | 100 dpi; 1; 20 documents; 200 pages; 3,600 s | 100 documents; 2,000 pages; 200 MB a PDF |
| Read text from pages | Pages from, Which pages, Flag a page when sureness is below, Who checks the pages | no_text_layer; 80 %; 200 pages; 7,200 s | 2,000 pages; billed per page read |
| Measure image | Image, What to measure, output columns | contrast; 50 rows | 500 rows |
| Measure mask | Mask, Marked from brightness, Column prefix | 128; 50 rows | 500 rows |

## People

| Step | Main settings | Defaults | Limits |
|---|---|---|---|
| Approval | Task title, What to check, Fields, Reviewers, Decide within (hours) | 72 hours; the workspace's administrators | 720 hours |

## Outputs

| Step | Main settings | Defaults | Limits |
|---|---|---|---|
| Save File | File name, Format, One file per row, JSON columns | csv; off; 100 files | 1,000 files; name 128 characters |
| Upload to bucket | Bucket, Object key, Format, One file per row, JSON columns | csv; off; 100 files; 3 tries; 600 s | Administrators only; 1,000 objects |
| Generate report | Report design, Template, Version, Report name, Formats, Period, Brand profile, One report per row | Design here; latest; 20 reports; 900 s | 200 reports |
| Render PDF | File name, Title, Header fields, Columns, Page, Watermark, Sections | auto; 5,000 rows; full data attached; 900 s | 50,000 rows; 20 sections |
| Send Notification | Title, Message, Severity, To, Send, Link | INFO; owner; always; 120 s | 500 people |
| Send webhook | Webhook, Send, Columns, At most rows, Fields, Wait, Fail unless delivered | summary; 500 rows; 10 s; off; 120 s | Administrators only; 5,000 rows; 60 s wait |
| Write Database | | | Switched off: database connections are read-only |

## Data a step can hold

By default, a step that holds its rows in memory (such as **Join**, **Enrich** or **AI prompt**) stops at 50,000 rows,
200 columns or 1,000,000 cells, and at 50 MB for a file. Steps that stream their rows instead (the file reads, **Filter**,
**Select columns**, **Compute**, **Sort**, **Aggregate**, **Remove duplicates**, the file outputs and others) keep them on
disk and are held only to much larger safety limits, so a file of a million rows can be read, filtered and aggregated.
A step that reaches a limit fails and says so; it never cuts rows silently.
