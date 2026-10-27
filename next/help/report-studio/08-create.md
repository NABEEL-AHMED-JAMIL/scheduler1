---
id: rs-create
title: Create a report in the console
summary: The four steps of New report — template, data and mapping, preview and checks, generate — and generating again.
section: Generate
who: Anyone with Generate reports
where: Reports › Library (/reports/library); Reports › Templates (/reports/templates)
related: rs-data, rs-pipeline, rs-approve, rs-troubleshooting
popular: Create a report from a pipeline run
---
**New report** makes a report by hand from a published template and the data you pick. It has four steps, shown at
the top: **Template**, **Data and mapping**, **Preview and check** and **Generate**.

## 1. Template
1. Choose **New report** (on the Overview or the Library), or **Create report** on a template.
2. Pick a published template. Only published versions make reports; they never change. Give the report a **Report name**.

## 2. Data and mapping
1. Under **Data source**, pick where the data comes from: a **Pipeline run**, a **Bucket file**, **Uploads**,
   **Paste JSON**, **Samples** or **Several files** ([Data and test samples](#rs-data)). **What the source holds** shows a
   **Sample**, the **Schema** and the **JSON**.
2. Under **Match template fields**, each field the template reads has a **Source field**. Every required field needs
   one; nothing is guessed. The status reads **Matched**, **Missing** or **Optional**, and the count says how many of
   them are matched.
3. Choose **Preview and check** (or **Preview with problems** to see what goes wrong).

![Data and mapping](rs-new-mapping "Create a report, Data and mapping: the data source on the left, the template's fields matched on the right")

> **Warning:** A required field the data does not have is never filled in for you. Add it to the pipeline's output and
> run the pipeline again, or match the field the data names differently.

## 3. Preview and check
The **Preview** shows the pages ("Not generated"; "—" marks a missing value; a preview prints at most 200 rows a
table). The **Checks** say how many are **blocking**, how many are warnings and how many passed. Warnings don't block;
fix a blocking problem with **Fix the data mapping →**.

On the right:

- **Branding**: the brand profile (the template's, the workspace default, or another published one), and whether its
  approval will sign the PDF.
- **Outputs**: **PDF** (print-ready) and **HTML** (opens in any browser, self-contained); **Why (optional)**, a note kept
  with the version; **Mark this version as COPY** (COPY on every page).
- **Generate vN** makes the version. The template version and the data are recorded with it.

## 4. Generate
The job shows its progress. When it finishes, **Open the report**: version N is ready and earlier versions are kept.
If it fails, no version is made and the message says why; **Back to mapping** to fix it.

## Generate again
On a report's page, **Generate again** makes the next version: pick the **Template version** and the **Data** (the
frozen data of the current version, or **Other data: a newer run, a file, pasted JSON**), tick **Mark this version as
COPY** or **Ask for approval when it is ready**, and choose **Check and generate vN**. An approved version stays; the
new one needs its own approval.

## Limits
- Generating is limited to 30 a minute a person, and previews to 30 a minute (the designer's live page to 120); past
  that you are asked to wait a few seconds.
- The workspace's page limit applies to every report ([Retention and page limits](#rs-limits)).

## Example
At Summit Valley, Claire Martin (finance controller) creates **Budget vs actual · 2026-10** from the October budget run:
she picks the template, then the budget pipeline's latest run and its output, checks that every required field reads
**Matched**, reads the preview, and generates v1 as PDF and HTML.
