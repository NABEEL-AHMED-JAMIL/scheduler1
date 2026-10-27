---
id: pl-placeholders
title: Placeholders and run parameters
summary: "{{date}}, {{run}}, a row's columns and run parameters: what each fills in, and where it can be used."
section: Build and try
who: A workspace administrator writes them; they fill in every run
where: Build › Pipelines › a pipeline › Steps and Settings (/pipelines/list)
related: pl-settings, trg-run-now, trg-backfills, step-outputs, step-check
popular: Use the run's date in a file name
---
A **placeholder** is a name in double braces, such as `{{date}}`, written in a step's text setting. Each run fills it
in: the day, the run's number, a value from the row, or a value the run was given. One pipeline can then write a new
file every day, name a report after its patient, or read only the period it was started for.

An unknown placeholder is left as written, so a typing mistake shows in the result instead of vanishing.

## The run's placeholders

| Placeholder | Fills in |
|---|---|
| `{{date}}` | The day the run started, as 2026-10-26 (Chicago time) |
| `{{time}}` | The time the run started, as 061500 (hours, minutes, seconds) |
| `{{run}}` | The run's number |
| `{{attempt}}` | Which try of the run this is |
| `{{step}}` | The step's key |
| `{{job}}` | The schedule's number |
| `{{pipeline}}` | The pipeline's id |
| `{{rows}}` | How many rows the step has (where a step has rows) |

## A run started for files or documents

| Placeholder | Fills in |
|---|---|
| `{{input_key}}`, `{{input_name}}` | The file the run was started for: its key in your storage, and the key's last part |
| `{{input_count}}`, `{{input_keys}}` | How many files a run took, and their keys joined by commas |
| `{{document_count}}`, `{{document_ids}}` | How many approved documents started the run, and their ids |
| `{{document.field}}` | A field of the first document, such as `{{document.patient_name}}`; also `{{document.id}}` and `{{document.file_name}}` |

In a run that no document started, `{{document_count}}` is 0 and the document placeholders are empty.

## A row's columns

Where a step works row by row, `{{column}}` is that row's value: `{{mrn}}`, `{{file_stem}}`. Where a step fills a
setting once for the whole step (a notice's title, an approval's title), the first row's values are used.

## Run parameters

Run parameters are values a run is given. Declare them on the pipeline's **Settings** tab, under **Run parameters**:

1. Choose **Add a parameter**.
2. Give it a **Name** (lower case letters, digits and _, starting with a letter), a **Type** (**Date**, **Date and
   time**, **Text**, **Number**, **Yes or no** or **Choice**), a **Label** people see, a **Default**, whether it is
   **Required**, and for a choice its **Choices** (separated by commas).
3. Save. Steps read the value as `{{param.name}}`.

| Placeholder | Fills in |
|---|---|
| `{{param.name}}` | The run's value for that parameter, or its default |
| `{{run.date}}` | The day the run is for, in the workspace's billing time zone; for a backfill, the period's day |
| `{{run.windowStart}}`, `{{run.windowEnd}}` | The start and end of the run's period |

A scheduled run takes the defaults. **Run with…**, a backfill and the API may give other values; see
[Run now and Run with…](#trg-run-now).

![Two run parameters declared on a pipeline](pl-parameters "Run parameters: a from and a to date, read by the steps as {{param.from}} and {{param.to}}")

## Where placeholders work

Placeholders fill in the text settings that say so in their hint ("{{date}} and the other run placeholders are filled
in"). The main ones:

| Step | Settings that take placeholders |
|---|---|
| Read CSV/JSON/Parquet | **File** |
| Read S3 | **Prefix** |
| Read API | **Variables** |
| Read documents | **Approved from**, **Approved to** |
| AI prompt | **Variables** |
| Call API, Enrich | **Variables** |
| Run pipeline | **Parameters** |
| Approval | **Task title**, **What to check**, **Fields** |
| Convert file | **Output key** |
| Save File | **File name** |
| Upload to bucket | **Object key** |
| Generate report | **Report name**, **Period** |
| Render PDF | **Title**, **Header fields**, **Watermark**, section titles and notes |
| Send Notification | **Title** |
| Send webhook | **Fields** |

```A daily file name
ops/beds/census-{{date}}.csv
```

```One file per row, named from the row
insights/{{file_stem}}.json
```

> **Note:** A row's values fill a key's name but cannot add folders to it.

## Example

Summit Valley's **Consent forms by date range** declares two **Date** parameters, `from` and `to`. Its **Read
documents** step reads consent forms approved from `{{param.from}}` to `{{param.to}}`, so a records officer can press
**Run with…** and count the forms of any month.

## Limits

| What | Limit |
|---|---|
| Run parameters on one pipeline | 20 |
| A text parameter's value | 500 characters, one line, no `{{` |
