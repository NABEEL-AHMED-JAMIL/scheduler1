---
id: step-combine
title: "Combine steps: join, stack, group and reshape"
summary: Join, Append (union), Aggregate, Pivot (rows to columns), Unpivot (columns to rows) and Run pipeline.
section: Combine and check
who: A workspace administrator adds steps; Run pipeline is an administrator's step
where: Build › Pipelines › a pipeline › Steps › Add step (/pipelines/list)
related: step-shape, step-check, pl-run-pipeline, step-glance
---
Combine steps bring the rows of several steps together, or turn many rows into fewer. A combining step names the
earlier steps it brings in by their keys, so the order of the steps and their keys matter.

![The Join step's settings](step-combine "Join: the claims joined to the remittances on the claim id, keeping every claim")

## Join

**What it does.** Joins the rows it reads (the left side) with an earlier step's output (the right side) on equal keys.

**Settings.**

- **Join with** (required): the earlier step whose output is the right side.
- **On**: pairs of **Left column** and **Right column** that must be equal.
- **Keep**: `inner` (matched rows only) or `left` (every row of the input, the right side's columns empty where nothing
  matched).
- **Prefix for clashing columns** (`right_`): put before a right-side column whose name the left side already has. The
  right side's key columns are dropped.

**Example.** **Payment reconciliation** joins each claim to its remittance on `claim_id`, keeping every claim (`left`)
and prefixing the remittance's columns with `remit_`, so unpaid claims stay in the list.

**Limits.** 10 key pairs.

## Append (union)

**What it does.** Stacks the rows of two or more earlier steps, matching columns by name.

**Settings.**

- **Steps to stack** (required): the earlier steps, in this order.
- **Columns**: `all` (every column any step has; missing ones are empty) or `common` (only the columns every step has).
- **Source column**: a column to add holding the key of the step each row came from.
- **Column types**: a column's kind (number, text, boolean) to convert every step's values to. **Convert mismatched
  values** (on) converts a value of another kind, failing when it cannot.

**Example.** **Journey 9 · Care-plan draft** stacks the patient's record, labs, triage and imaging results, with a
**Source column** named `stage`, before asking the model for a draft plan.

**Limits.** 2 to 20 steps.

## Aggregate

**What it does.** Groups rows by columns and computes a figure per group.

**Settings.**

- **Group by**: the columns that make a group. Empty: one row for all the input.
- **Aggregations**: each a **Compute** (`count`, `count_distinct`, `sum`, `avg`, `min`, `max`, `first`, `last` or
  `list`), **Of column** (every operation but count needs one) and **As column**. `list` is the group's distinct values
  as one text, joined by ", ".

**Example.** **Bed occupancy by ward** counts beds, sums occupied beds and finds the longest stay per ward.

**Limits.** 20 group columns; 1 to 50 aggregations.

## Pivot (rows to columns)

**What it does.** Turns rows into columns: one row per group, one column per value of a column.

**Settings.** **Row per** (the columns that make one output row, such as a patient id), **Names from** (its values
become the new columns' names), **Values from** (what fills them), **When a group has several** (`first`, `last`,
`sum`, `count`, `min`, `max` or `avg`), **Only these** (the new columns to make, in order; others are left out).

**Example.** **Journey 15 · Cohort stages** makes one row per patient with a column per stage of the journey, each the
time that stage ended.

**Limits.** 200 new columns. Time limit 1,800 seconds.

## Unpivot (columns to rows)

**What it does.** Turns columns into rows: each named column becomes a row with its name and value, the other columns
repeated.

**Settings.** **Columns to turn into rows** (required), **Name column** (`name`), **Value column** (`value`), **Keep
empty values** (off).

**Example.** **Budget vs actual by cost centre** turns a budget sheet with a column per month into one row per cost
centre and month, so it can be joined to the actuals.

**Limits.** 200 columns.

## Run pipeline

**What it does.** Calls another pipeline of the workspace with parameters, once or once per row, waits for its run and
takes its answer as rows.

**When to use it.** A piece of work several pipelines need, built once. Settings, results and limits are in
[Call another pipeline](#pl-run-pipeline).

**Limits.** An administrator's step; at most 3 calls deep; each call is a run, billed like any run.
