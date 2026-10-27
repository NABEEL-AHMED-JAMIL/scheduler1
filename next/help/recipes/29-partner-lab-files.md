---
id: rcp-partner-lab-files
title: Take in a partner lab's result files
summary: When a lab partner's file lands in the inbox, drop the rows that do not hold to the lab-result contract and keep the rest in your bucket for the next pipeline.
section: Healthcare
who: A workspace administrator builds it (Upload to bucket is an administrator's step); anyone with File drop puts the files in
where: Connections › Data contracts (/connections/contracts); Build › Pipelines (/pipelines/list); Documents › Intake › File drop (/documents/intake/file-drop)
related: con-contracts, trg-file, doc-file-drop, step-check, step-outputs, dev-files-forms
---
A partner lab sends a file of results every day. The file must look as agreed: a result id, the patient reference, the
LOINC code and the value on every line. This recipe starts a run for each file that arrives, keeps only the lines that
hold to the `lab_result` contract, and writes them to a dated file in your bucket, where the next pipeline (a dashboard
feed, an abnormal-results check) reads them. A file sent with the wrong columns keeps nothing, so a wrong file never
reaches the next step.

> **Note:** The lab, patients and values are synthetic. The lab could as well upload its files through the API (see
> [Files and forms through the API](#dev-files-forms)); this recipe uses File drop.

## What you'll build

- A data contract `lab_result`.
- A pipeline **Partner files: upload and process** of three steps, started whenever a file named `partner-labs*.csv`
  arrives.

![The pipeline's steps](rcp-x-partner-steps "Summit Valley's partner files pipeline: the arrived file, the contract check (drop), the upload to the bucket")

## What you need first

1. **A storage connection**, *your bucket*, and **File drop** set up to it (see [The file drop](#doc-file-drop)).
2. The sample files:
   - [lab_result-sample.json](/help/samples/partner-lab-files/lab_result-sample.json): one result, for the contract.
   - [partner-labs-2026-10-26.csv](/help/samples/partner-lab-files/partner-labs-2026-10-26.csv): 400 HbA1c results
     (`result_id`, `patient_ref`, `loinc`, `test_name`, `value`, `unit`, `reference_low`, `reference_high`,
     `effective`).
   - [partner-labs-wrong-header.csv](/help/samples/partner-lab-files/partner-labs-wrong-header.csv): 40 of the same
     results with the column `loinc` misnamed `loinc_code`.

## Build it

### The contract

1. **Get data in › Connections › Data contracts**, **New from sample**.
2. **Name** `lab_result`; **Direction** *In: a customer's payload*; **Sensitivity** `sensitive`.
3. Paste `lab_result-sample.json` into **Sample** and choose **Propose schema**. Every value in it is in quotes, as the
   cells of a CSV are, so every field is proposed as text.
4. Tick **Required** on `result_id`, `patient_ref`, `loinc` and `value`; choose **Save v1**.

### The pipeline

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Partner files: upload and process`, **Create
   and add steps**.
2. Add:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `file` | **Bucket** and **File** empty (the file the run was started for); **Format** `csv` |
| 2 | Validate | `check` | **Contract** `lab_result`; **Rows that do not hold** `drop` |
| 3 | Upload to bucket | `keep` | **Bucket** your bucket; **Object key** `partners/files/{{date}}-{{run}}.csv`; **Format** `csv` |

3. **Settings**: **Data sensitivity** **Sensitive**. **Validate**, **Save**.

### Start it when a file arrives

1. **Schedule**: **Schedule name** `Partner files`, **Only when started**.
2. **Also starts when**: tick **A file arrives**; **Which files** `partner-labs*.csv`; **Files per run** `1`.
3. Under **Email me when**, tick **A run fails**, so a broken file reaches someone. **Create schedule**.
4. On **Get data in › Documents › Intake › File drop**, drop `partner-labs-2026-10-26.csv`.

## Check it worked

1. **Run & review › Runs** shows a run of **Partner files: upload and process**, started by the file: **Completed**, 3
   of 3 steps, **400 → 400 → 400**.
2. **See results › Analysis › Files**, your bucket, `partners/files/`: a file named after the day and the run's number,
   such as `2026-10-26-2051.csv`, with 400 rows.
3. Now drop `partner-labs-wrong-header.csv`. Its run also completes, but **Validate** reads 40 and keeps **0**: no line
   has a `loinc` column. The file it uploads has no rows.

![The run's steps](rcp-x-partner-run "Summit Valley's run: a 40,000-row partner file, every row held to lab_result, uploaded")

Summit Valley's partner file had 40,000 results; all 40,000 held to its `lab_result` contract and were uploaded.

> **Note:** Not yet verified end to end with the wrong-header file. With **Rows that do not hold** `drop`, a file
> whose every row fails completes with 0 rows; use `fail` when such a file should stop the run and email you.

## Common mistakes

- **Every row is dropped from a good file.** The contract was made from a sample with numbers (`"value": 7.2`). A CSV's
  cells arrive as text, so a number field never holds. Make the contract from a sample with every value in quotes.
- **The drop starts nothing.** The file's name must match `partner-labs*.csv` (the pattern is a file name, not a
  folder) and the schedule must be **Active**.
- **Two files overwrite each other.** Keep `{{run}}` in the **Object key**: two files on one day are two runs, two
  numbers.
- **You want to know about the dropped lines.** Use **Rows that do not hold** `flag`, then a **Filter** on `_valid`
  `eq` `false` and a **Save File** for them, as in [Check a claims file](#rcp-claims-validation).
