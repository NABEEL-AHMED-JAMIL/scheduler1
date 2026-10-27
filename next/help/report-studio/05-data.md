---
id: rs-data
title: Data and test samples
summary: What a report can read — a pipeline's output, a step's own input, a bucket file, an upload, several files — and test samples.
section: Data
who: Report data to browse and upload on the Data tab; anyone editing a template may add test data
where: Reports › Data (/reports/data); Reports › Templates (/reports/templates)
related: rs-designer, rs-create, rs-pipeline
---
A report is a template filled with data. The data is one JSON document (or a CSV, read as rows); the template's
bindings are paths into it. You choose the data twice: while designing (the **test data**, so the page fills as you
work) and when you generate (the real data, matched to the template's fields).

## Where data can come from

| Source | What it is |
|---|---|
| **Pipeline run** | An output a pipeline's run kept: pick the schedule, the run and the output. **Use a newer run** jumps to the latest |
| **This step's input** | In a pipeline's own report design: the rows the Generate report step read in a recent run |
| **Bucket file** | A JSON or CSV file in one of your storage buckets, read only |
| **Uploads** | A JSON or CSV file uploaded on **Reports › Data** (with the Report data page) |
| **Paste JSON** | Text you paste; read at once and never stored unless you keep it as a test sample. **It is CSV** reads a header row and rows |
| **Samples** | Test samples kept with the template |
| **Several files** | Up to 8 files side by side in one document, each under a name you give (`summary`, `details`); the report reads `$.summary`, `$.details[0]` |

Everything is read **as you**: a run, bucket or file you cannot open elsewhere in the console is refused here too.

## Browse data on the Data tab
1. Open **Reports › Data**. The three cards say what you may read: **Pipeline outputs**, **Storage buckets** and
   **Documents and uploads**.
2. In **Sources**, pick a run (**Pipeline schedule**, then **Inspect**), a bucket file or an upload.
3. The right side shows the **Schema** (each field, its type, whether it can be empty), the **Sample rows** (up to
   100) and which templates can read it. **Report data starts at** sets the starting point in the JSON: paths below are
   relative to it.
4. **Upload a file** (JSON or CSV) keeps a file for reports; **Keep in Sources** keeps a run's output to find again.

![The Data tab](rs-data "Reports › Data: what you may read, a source's schema and its first rows")

> **Note:** Browsing here never changes a report or a pipeline. To change the data, change the pipeline and run it
> again.

## Add test data to a template
1. In the designer, choose the test-data button in the toolbar (or **Add test data** on the **Data** tab).
2. Pick a source as above; the page fills at once. The **Data** tab then lists the fields to click and bind.
3. To keep it, choose **Keep as a test sample**: it is saved with the template, so whoever changes it next tests against
   the same data. A template's page lists its **Test samples**.

## A pipeline step's own input
When a **Generate report** step designs its report in the step (**Design the report here**), the designer opens on the
rows that step read in the pipeline's latest run (**This step's input**). A copy is frozen with the design: the first
500 rows, sensitive columns masked. If the run has expired, pick a newer run or paste sample JSON.

## Limits
| What | Limit |
|---|---|
| Pasted data | 5 MB |
| Several files | 8 files, each at most 2,000 rows |
| Sample rows shown on the Data tab | 100 |
| A step's frozen input | the first 500 rows, sensitive columns masked |

> **Privacy:** Use synthetic or de-identified data for test samples: a sample is kept with the template and anyone who
> may edit the template sees it.
