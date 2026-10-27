---
id: rcp-cohort-check
title: Check a research cohort against a contract, starting from sample rows
summary: Build a pipeline on twenty rows you write yourself, hold them to a registry contract, keep the cohort file, then swap the sample for the real file.
section: Healthcare
who: A workspace administrator
where: Connections › Data contracts (/connections/contracts); Build › Pipelines (/pipelines/list)
related: pl-try, con-contracts, step-check, step-read, sec-health-data
---
A research team receives cohort extracts for a disease registry: one row per patient, with the patient's record number
and condition. Before anything is done with an extract, every row must carry both. This recipe builds the check the way
a careful team would: first on twenty synthetic rows written into the pipeline itself (**Test with sample**), and only
when it works on those, on the real file.

> **Note:** The twenty patients are synthetic record numbers (`SV-000900` to `SV-000919`). A real research extract would
> also be masked for the researchers who read it (see [Working with health data](#sec-health-data)).

## What you'll build

- A data contract `registry_rows`: `mrn` and `condition`, both required.
- A pipeline **Synthetic cohort generator check** of three steps: the rows, **Validate**, **Save File**.

![The pipeline's steps](rcp-x-cohort-steps "Summit Valley's cohort check: a Sample rows step first, then Validate and Save File")

## What you need first

1. Page access to **Data contracts** and **Pipelines**, as a workspace administrator.
2. The sample files:
   - [registry_rows-sample.json](/help/samples/cohort-check/registry_rows-sample.json): one row, for the contract.
   - [cohort-sample-rows.json](/help/samples/cohort-check/cohort-sample-rows.json): the twenty rows, for **Test with
     sample**.
   - [cohort.csv](/help/samples/cohort-check/cohort.csv): the same twenty rows as a file, for the last part.

## Build it

### The contract

1. **Get data in › Connections › Data contracts**, **New from sample**.
2. **Name** `registry_rows`, **Direction** *In: a customer's payload*, **Sensitivity** `sensitive`.
3. Paste `{"mrn": "SV-000900", "condition": "diabetes"}` into **Sample**, choose **Propose schema**, tick **Required**
   on `mrn` and `condition`, and choose **Save v1**.

### The pipeline on sample rows

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Synthetic cohort generator check`, **Create
   and add steps**.
2. On the **Steps** tab, choose **Test with sample**. Replace the two example rows in **Sample rows** with the contents
   of `cohort-sample-rows.json` and choose **Use these rows**. A **Sample rows** step is now first (see
   [Try a pipeline](#pl-try)).
3. Add the other two steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Sample rows | `rows` | The twenty rows (made by **Test with sample**) |
| 2 | Validate | `check` | **Contract** `registry_rows`; **Rows that do not hold** `fail` |
| 3 | Save File | `keep` | **File name** `cohort.csv`; **Format** `csv` |

4. **Settings**: **Data sensitivity** **Sensitive**. Choose **Validate**: "The definition is valid."
5. **Save**, then **Run now**.

The first three rows of `cohort-sample-rows.json`, to show its shape:

```Sample rows (the first three of twenty)
[
 { "mrn": "SV-000900", "condition": "diabetes" },
 { "mrn": "SV-000901", "condition": "heart failure" },
 { "mrn": "SV-000902", "condition": "copd" }
]
```

### See it refuse a bad row

1. Choose **Test with sample** again, delete `"condition": "copd"` from the third row (keep its `mrn`), and choose
   **Use these rows**.
2. **Save & run now**. The run **Fails** at **Validate**: a row lacks the required `condition`, and nothing is saved.
3. Put `"condition": "copd"` back in the same way and run again.

### Swap in the real file

1. Put `cohort.csv` in your bucket under `registry/` with **See results › Analysis › Files** (see [Files](#dash-files)).
2. On the **Steps** tab, remove the **Sample rows** step (its bin) and add **Read CSV/JSON/Parquet** first, **Key**
   `rows`, **Bucket** your bucket, **File** `registry/cohort.csv`. Move it to the top with its arrows.
3. **Validate**, **Save**, **Run now**.

## Check it worked

- On the sample rows: the run is **Completed**, 3 of 3 steps, **20 → 20** rows at every step, and `cohort.csv` (20
  rows) on the **Outputs** tab.
- With the row missing its condition: the run **Fails** at step 2, and **Outputs** has no file.
- On the real file: again 20 rows read, checked and saved.

![The run's steps](rcp-x-cohort-run "Summit Valley's run: 20 synthetic rows checked against registry_rows and kept")

Summit Valley's run of the same pipeline (job "Synthetic cohort generator check") read its 20 sample rows, all held to
`registry_rows`, and kept `cohort.csv`.

## Common mistakes

- **The Sample rows step is still first in production.** It is a real step of the pipeline: once the pipeline works,
  replace it with the real **Read** step before you schedule it.
- **Validate passes a row whose condition is empty text.** `"condition": ""` is there and is text, so it holds. A
  contract made from a sample checks that each field is present and of its type.
- **The real file fails on its first row.** Its columns are named differently (`patient_mrn`, `dx`): the contract
  asks for `mrn` and `condition` by name. Rename them with **Select columns** before **Validate**, or ask the sender
  for the agreed names.
- **Use these rows is refused.** **Sample rows** must be a JSON list of objects: square brackets around, a comma
  between rows, no comma after the last.
