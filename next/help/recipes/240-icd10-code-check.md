---
id: rcp-icd10-code-check
title: Check ICD-10 codes against the CMS list
summary: Look each claim's diagnosis code up in the CMS ICD-10-CM code list, add its description and chapter, and keep the invalid, header and blank codes for review with a summary.
section: Healthcare
who: A workspace administrator uploads the code list and makes the pipeline; anyone with Browse files can upload the claims
where: See results › Analysis › Files (/data/files); Build › Pipelines (/pipelines/list); See results › Analysis › Data Catalog (/data/catalog)
related: rcp-claims-validation, step-combine, step-shape, step-outputs, dash-catalog, dash-files
---
A claim's diagnosis code must be a code in the year's ICD-10-CM list, and a billable one: a category such as `E11` is
in the list but is not valid on a claim, because it needs more characters (`E11.9`). This recipe keeps the list as a
file in your own storage, looks every claim's code up in it, writes each code's official description and chapter
beside the claim, and keeps the claims whose code is **invalid**, a **header** or **blank** in one file for the coding
team, with a count of each.

> **Note:** The claims in the sample are synthetic. The code list is the public one CMS publishes; it holds no patient
> data. Only ICD-10-CM diagnosis codes are checked here: procedure codes (CPT) are licensed separately and are not part
> of this recipe.

## What you'll build

- The code list as a CSV file in your storage, `reference/icd10cm/2026/codes.csv`, listed in the **Data Catalog** as a
  **Public** reference dataset.
- A pipeline **ICD-10 code check**: read the claims and the list, tidy each code (spaces, dots, lower case), look it up,
  give it a status, then keep the flagged claims and a summary.

## What you need first

1. **Page access** to **Browse files**, **Pipelines** and **Data Catalog**; a workspace administrator for the pipeline.
2. **A storage connection** (**Get data in › Connections › Storage**, see [Storage](#con-storage)).
3. **The code list as a CSV.** CMS publishes the list each fiscal year on its ICD-10 page
   ([cms.gov ICD-10 codes](https://www.cms.gov/medicare/coding-billing/icd-10-codes)): the *Code Descriptions in Tabular
   Order* file holds every code, header codes too, as fixed-width text. Turn it into a CSV with at least these columns:

   | Column | Holds | Example |
   |---|---|---|
   | `code_nodot` | the code as the file writes it, no dot | `E119` |
   | `code` | the code with its dot after the third character | `E11.9` |
   | `description` | the long description | Type 2 diabetes mellitus without complications |
   | `chapter_title` | the chapter, by code range | Endocrine, nutritional and metabolic diseases (E00-E89) |
   | `billable` | `1` for a code valid on a claim, `0` for a header (the file's flag) | `1` |

   The fiscal year 2026 list has 98,186 codes: 74,719 billable and 23,467 headers.
4. **The sample files**:
   - [claims-icd10-sample.csv](/help/samples/icd10-code-check/claims-icd10-sample.csv): 37 synthetic claims with the
     columns `claim_id`, `patient_ref`, `payer`, `service_date`, `icd10`, `billed`. The codes are written in every way
     people write them: `E11.9`, `E119`, `e11.9`, ` J45.909 ` with spaces, a header, a misplaced dot, an old ICD-9
     code, an empty cell.
   - [icd10cm-2026-excerpt.csv](/help/samples/icd10-code-check/icd10cm-2026-excerpt.csv): 40 rows of the FY2026 list in
     the columns above, enough to try the recipe before you load the whole list.

## Load the list and the claims

1. Open **See results › Analysis › Files**, choose your storage connection, and make the folders `reference/icd10cm/2026`
   with **New folder**. **Upload** the list there and name it `codes.csv` (or upload the excerpt under that name).
2. Make a folder `claims/in` and **Upload** `claims-icd10-sample.csv` into it.
3. Open **See results › Analysis › Data Catalog** and search `codes.csv`. Open it, give it a description ("ICD-10-CM
   FY2026 code list from CMS, public domain") and set its **Sensitivity** to **Public**: a published code list is not
   sensitive (see [The Data Catalog](#dash-catalog)).

## Build the pipeline

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `ICD-10 code check`, **Create and add steps**.
2. Add the steps in order. A step reads the step just before it unless its **Reads** names another; the table says when.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `claims` | **Bucket** your connection; **File** `claims/in/claims-icd10-sample.csv`; **Format** `csv` |
| 2 | Read CSV/JSON/Parquet | `reference` | **File** `reference/icd10cm/2026/codes.csv`; **Format** `csv`; **Only these columns** `code_nodot`, `code`, `description`, `chapter_title`, `billable` |
| 3 | Transform | `clean` | **Reads** `claims`. **Column** `icd_clean`, **Operation** `trim`, **From column** `icd10`; **Keep the other columns** on |
| 4 | Transform | `nodot` | **Column** `icd_key`, **Operation** `replace`, **From column** `icd_clean`, **Replace** `.`, **With** empty; **Keep the other columns** on |
| 5 | Transform | `upper` | **Column** `icd_key`, **Operation** `upper`, **From column** `icd_key`; **Keep the other columns** on |
| 6 | Filter | `ref_a` | **Reads** `reference`. **Column** `code_nodot`, **Is** `lt`, **Value** `N` |
| 7 | Filter | `ref_b` | **Reads** `reference`. `code_nodot` `gte` `N`, and `code_nodot` `lt` `S6` |
| 8 | Filter | `ref_c` | **Reads** `reference`. `code_nodot` `gte` `S6`, and `code_nodot` `lt` `T` |
| 9 | Filter | `ref_d` | **Reads** `reference`. `code_nodot` `gte` `T` |
| 10 | Join | `lookup_a` | **Reads** `upper`. **Join with** `ref_a`; **On** `icd_key` = `code_nodot`; **Keep** `left` |
| 11 | Join | `lookup_b` | **Join with** `ref_b`; **On** `icd_key` = `code_nodot`; **Keep** `left`; **Prefix for clashing columns** `b_` |
| 12 | Join | `lookup_c` | as 11, with `ref_c` and the prefix `c_` |
| 13 | Join | `lookup_d` | as 11, with `ref_d` and the prefix `d_` |
| 14 | Transform | `found` | **Keep the other columns** on; four columns, each **Operation** `coalesce`: `icd_code` from `code`, `b_code`, `c_code`, `d_code`; `icd_description`, `icd_chapter_title` and `icd_billable` the same way from `description`, `chapter_title` and `billable` |
| 15 | Compute | `status` | the four formulas below, in this order |
| 16 | Filter | `flagged` | **Column** `icd_status`, **Is** `ne`, **Value** `valid` |
| 17 | Save File | `keep_flagged` | **File name** `icd10-flagged-{{date}}.csv`; **Format** `csv` |
| 18 | Aggregate | `summary` | **Reads** `status`. **Group by** `icd_status`; **Compute** `count` **As column** `claims` |
| 19 | Save File | `keep_summary` | **File name** `icd10-summary-{{date}}.csv`; **Format** `csv` |

Why four slices: a **Join** holds both its sides in memory, at most 50,000 rows each, and the full list is about twice
that. Each **Filter** passes a quarter of the list (about 25,000 codes) to its own join; a code is in exactly one
slice, and step 14 takes its entry from whichever slice had it. With the excerpt alone one join would do, but the four
work for both.

The formulas of step 15, each its own **Column** (turn **Empty when it cannot be worked out** on for `dot_ok`):

```The Compute step's formulas
dot_ok      if(is_null(regex_extract(icd_clean, '[.]')), 1, if(is_null(regex_extract(icd_clean, '^[A-Za-z0-9]{3}[.][A-Za-z0-9]{1,4}$')), 0, 1))
not_found   if(is_null(icd_code), 1, 0)
icd_status  if(is_null(icd_clean), 'blank', if(is_null(icd_code) or dot_ok == 0, 'invalid', if(number(icd_billable) == 0, 'header', 'valid')))
icd_issue   if(icd_status == 'blank', 'No diagnosis code', if(icd_status == 'invalid' and dot_ok == 0 and not_found == 0, concat('The dot is misplaced (it goes after the third character): ', icd_code, '?'), if(icd_status == 'invalid', 'Not a code in the CMS ICD-10-CM FY2026 list', if(icd_status == 'header', 'A category (header) code: not valid for submission, it needs more characters', ''))))
```

`dot_ok` catches a dot in the wrong place: `E1.19` without its dot is `E119`, a real code, but nobody meant to write it
that way. An empty cell, or one of only spaces, counts as empty for `is_null`.

3. On the **Settings** tab, **Data sensitivity** **Sensitive**: the claims are about patients, even if the list is not.
4. **Validate**, then **Save**, then **Run now**.

## Check it worked

The run (**Run & review › Runs**) is **Completed**. Open `icd10-summary-` and today's date from the **Outputs** tab:

| icd_status | claims |
|---|---|
| valid | 22 |
| header | 6 |
| invalid | 6 |
| blank | 3 |

`icd10-flagged-` holds the 15 flagged claims, each with its `icd_issue`. `E11`, `I50.3`, `J45`, `M54.5`, `S72.001` and
`Z00.0` are headers, each with its description beside it. `E11.99`, `XYZ.1`, `I10.1`, `250.00` and `R07.10` are not in
the list; `E1.19` says the dot is misplaced and names `E11.9`. The three blank claims say *No diagnosis code*. `i10`,
`E119` and ` J45.909 ` are valid: the tidying steps found them.

> **Tip:** To see every claim with its description and chapter, add a **Save File** after step 15. To chart the result,
> add an **Upload to bucket** after the summary (for example `claims/icd10-check/summary-latest.csv`) and point a
> dashboard widget at that file (see [Build a dashboard](#dash-build)).

## Example
At Summit Valley Health System the same pipeline reads the day's 5,000 synthetic claims (pipe-delimited: **CSV
delimiter** `|`). All 5,000 codes are valid, `E11.621` and `L97.529`, so the flagged file is empty and the summary has
one line. Its **ICD-10 code check** dashboard shows the counts by status and by chapter. The same check runs after the
AI step of *Operative notes: coding suggestions*, so a suggested code that is not a billable code in the list is
flagged before the coders see it.

## Common mistakes

- **The run fails at a Join: the output of step `reference` has 98,186 rows.** Join the slices (steps 6 to 9), never
  the whole list.
- **Every code is invalid.** The joins must match `icd_key` (the tidied code) with `code_nodot`, and the reference must
  be the CSV, not the fixed-width text file.
- **Blank codes are counted as invalid.** Test `is_null(icd_clean)` first, as the `icd_status` formula does.
- **Every line lands in one column.** A pipe-delimited claims file needs **CSV delimiter** `|`.
- **Next year's codes.** Each fiscal year (from 1 October) has its own list. Load it under its own folder
  (`reference/icd10cm/2027/`) and point step 2 at it; keep the old one for claims of the old year.
