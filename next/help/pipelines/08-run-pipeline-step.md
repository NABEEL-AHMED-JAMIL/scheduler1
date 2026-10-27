---
id: pl-run-pipeline
title: Call another pipeline with a Run pipeline step
summary: Use another pipeline's answer inside a pipeline, once or once per row, and how deep a chain may go.
section: Build and try
who: A workspace administrator (Run pipeline is an administrator's step)
where: Build › Pipelines › a pipeline › Steps (/pipelines/list)
related: pl-placeholders, trg-workflow, step-combine, step-glance
---
A **Run pipeline** step calls another pipeline of the same workspace with parameters, waits for its run to end and
takes its answer as rows. Build a piece of work once (a patient lookup, a risk score) and use it from several pipelines,
instead of copying its steps into each.

Each call is a run of its own: it shows in **Runs** under the called pipeline, with its own steps and outputs, and it is
billed like any run.

## Add a Run pipeline step

1. Open the calling pipeline's **Steps** tab and add **Run pipeline** from **Add step**.
2. **Pipeline**: choose the schedule of the pipeline to call. It must be one of this workspace's, active, and built from
   steps.
3. **Call**: `once` makes one call for the step, its parameters filled from the run and the first row; `each` makes one
   call per input row.
4. **Parameters**: the called pipeline's parameters by name, filled from the row and the run, such as `{{mrn}}`,
   `{{param.region}}` or `{{run.date}}`. They are checked against what the called pipeline declares, as **Run with…**
   checks them.
5. **Answer from**: `final` takes the called run's last output; or name the key of one of its steps.
6. **Fields**: the answer's columns to keep (a column, or a column holding JSON and a dot path into it, such as
   `summary.risk`), each with an **As** name. None: every column.
7. Choose **Apply**, then **Save**.

## What the step gives back

- With `once`: the called run's rows, at most **At most rows** of them (10,000 by default); the step warns when there
  were more.
- With `each`: the input rows, each with its call's first answer row and four columns about the call: its run id,
  status, ok and error, named with the **Column prefix** (`called_` by default: `called_run_id`, `called_status`,
  `called_ok`, `called_error`).

**When a call does not complete**: `fail` fails the step; `continue` (with `each`) keeps the row with its status and
error, so a later **Filter** can pick out the failed calls.

## From an approval workflow

An approval workflow can run a pipeline too, with a **Run pipeline** step of its own, and wait for it before the next
person decides. See [From an approval workflow](#trg-workflow).

## Example

A Summit Valley care-coordination pipeline reads the patients due a visit tomorrow, then calls **Journey 9 · Care-plan
draft** once per patient (`each`, parameter `mrn` = `{{mrn}}`), keeping the draft's `risk` field as `care_risk`. A
**Filter** then keeps the patients whose draft risk is High for the nurse's list.

## Limits

| What | Limit |
|---|---|
| Calls one step may make (`each`) | **At most calls**: 20 by default, up to 100; an input needing more fails before any call |
| How deep a chain may go | 3 calls deep (A calls B calls C calls D); a pipeline already in the chain cannot be called again |
| Rows taken from the answer (`once`) | **At most rows**, 10,000 by default |
| Time limit of the step | 3,600 seconds unless its panel says otherwise |
| Who may add it | A workspace administrator |
