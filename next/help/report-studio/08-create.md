---
id: rs-create
title: Create a report in the console
summary: The four steps of New report — template, data and mapping (data first, every field matched for you), preview and checks, generate — and generating again.
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
The data comes first; the template's fields are matched to it once it is read.

1. Under **Where does the data come from?**, pick a card: **A pipeline run**, **A file in the bucket**, **Upload a file**,
   **Paste JSON** (one record or a list) or **A test sample** saved with the template. **Several files as one report's
   data…** puts several files side by side ([Data and test samples](#rs-data)).
2. For a pipeline run, search the **Pipeline** list: each pipeline shows its last run, its rows and columns, and how many
   of the template's fields its newest completed run fits (**Fits 79 of 83**). Its **Run** list follows, with the
   latest completed run already chosen. **Its columns** show the data's columns with the first row's values.
3. When the data has several rows and the template makes one record's report, choose **The first row**, **One row I
   pick**, **One report per row** (a report for each row, at most 50) or **All rows in one report**. A template that
   lists the data's own rows always reads them all.
4. Every field is matched for you: by its key, by the template's label, by names written differently (case, `_` and
   spaces) and by common synonyms (`dob` and `date_of_birth`), with the type as a tie-breaker; a table's or list's
   columns are matched too. The header says **Matched N of M · K need you**.
5. **Needs you**, at the top, lists the fields a person must settle: a required field with no sure match, or two
   columns that fit equally well. Each shows why, a **Suggested** source with its value on the first row (for a name,
   often **combine first_name + last_name**), **Use it** and **Choose…**.
6. The other fields are grouped by the template's own sections, by the labels it prints them under (the key is shown
   small), and collapsed with **All matched** or **N need you**. **Needs you**, **All** and a search narrow the list.
7. **Choose…** (or a field's source) opens its picker: **A column** (searchable, each with its type, the first row's
   value and how well it matches), **Combine columns** (columns and text in order, the result on the first row shown) or
   **A fixed value**. A list picks the data's list and each of its columns. An optional field may be **left blank**; a
   required one may not.
8. The **Live preview** beside the fields draws the template's own pages with this data; the red boxes are where fields
   that still need a source print. The footer says how many required fields need a source; **Show me** takes you to
   them, and **Preview and checks →** goes on once nothing needs you.

![Data and mapping](rs-new-mapping "Create a report, Data and mapping: the data on top, the template's fields matched beside a live preview")

> **Note:** Your choices (a column, a combination, a fixed value, a field left blank, a list's columns) are kept with
> the version, so the next **Generate again** starts from them.

> **Warning:** A required field the data does not have is never filled in for you. Choose its source, add it to the
> pipeline's output and run the pipeline again, or pick other data.

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

**Other data** opens Data and mapping on the current version, never blank: **Same data as vN** (its frozen data) is
chosen, with every field's choice kept from vN (**Kept from vN**). **A newer run** starts on the report's own pipeline
with its latest completed run; **A file** is a bucket's file or an upload; **Paste JSON** is for a quick fix or a test.
New data is matched again, and every choice that still fits it is kept. **Changed from vN** lists what differs.

## Limits
- Generating is limited to 30 a minute a person, and previews to 30 a minute (the designer's live page to 120); past
  that you are asked to wait a few seconds.
- The workspace's page limit applies to every report ([Retention and page limits](#rs-limits)).

## Example
At Summit Valley, Claire Martin (finance controller) creates **Budget vs actual · 2026-10** from the October budget run:
she picks the template, then the budget pipeline (it fits every field) and its latest run, sees **Matched 18 of 18 ·
0 need you**, reads the preview, and generates v1 as PDF and HTML.
