---
id: rcp-run-pipeline
title: Call another pipeline with a Run pipeline step
summary: Build a small lookup pipeline with a parameter once, then call it from another pipeline once per row and keep its answer beside each row.
section: Building blocks
who: A workspace administrator (Run pipeline is an administrator's step)
where: Build › Pipelines (/pipelines/list); Build › Pipelines › Schedules & triggers (/pipelines/schedules); Run & review › Runs (/runs/latest)
related: pl-run-pipeline, pl-placeholders, trg-run-now, step-combine, rcp-run-and-wait
---
Some work is needed by many pipelines: finding a patient's details, scoring a risk, checking an eligibility. Build it
once as a pipeline of its own with a run parameter, and call it from the others with a **Run pipeline** step. This
building block makes a **Patient lookup** pipeline that answers one patient's name and clinic for a record number, then
a **Tomorrow's visits with patient details** pipeline that calls it once for each visit. The same lookup is what
[Run and wait](#rcp-run-and-wait) calls from outside the console.

> **Note:** Not yet verified end to end. No Summit Valley pipeline calls another with a **Run pipeline** step yet; its
> approval workflow **Patient journey** runs its pipelines with the workflow's own Run pipeline step. The settings below
> are those of the step's panel (see [Call another pipeline](#pl-run-pipeline)).

## What you'll build

- **Patient lookup**: a run parameter `mrn`, three steps, and a schedule that runs **Only when started**.
- **Tomorrow's visits with patient details**: three steps, the second a **Run pipeline** step that makes one call per
  visit, eight in all.

![Run pipeline in the Add step list](rcp-x-run-pipeline-add "Add step from the Task Registry: Run pipeline under Process, with what it does")

## What you need first

1. **A storage connection**, *your bucket* (see [Connect your storage](#con-storage)).
2. The sample files, in a folder `clinic/` of your bucket (**See results › Analysis › Files**, see [Files](#dash-files)):
   - [patient-directory.csv](/help/samples/run-pipeline/patient-directory.csv): 60 synthetic patients, `mrn`, `name`,
     `clinic`, `phone`.
   - [visits-tomorrow.csv](/help/samples/run-pipeline/visits-tomorrow.csv): 8 visits, `visit_id`, `mrn`, `time`,
     `visit_date`. Seven are in the directory; `SV-000999` is not.

## Build it

### The pipeline that is called

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Patient lookup`, **Create and add steps**.
2. **Settings** tab, **Run parameters**, **Add a parameter**: **Name** `mrn`, **Type** **Text**, **Label** `Record
   number`, **Required** ticked (see [Run parameters](#pl-placeholders--run-parameters)). **Data sensitivity**
   **Sensitive**.
3. **Steps**:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `directory` | **Bucket** your bucket; **File** `clinic/patient-directory.csv` |
| 2 | Filter | `one` | **Column** `mrn`, **Is** `eq`, **Value** `{{param.mrn}}` |
| 3 | Select columns | `answer` | **Columns** `mrn`, `name`, `clinic` |

4. **Validate**, **Save**.
5. **Schedule**: **Schedule name** `Patient lookup`, **Only when started**, **Create schedule**. A Run pipeline step
   calls a pipeline by its schedule.
6. Try it: in **Build › Pipelines › Schedules & triggers**, the schedule's **⋮** menu, **Run with…**, **Record number**
   `SV-000703`, **Run**. The run's last step has 1 row: `SV-000703`, `Noah Pryce`, `Lakeview clinic`.

### The pipeline that calls it

1. **New pipeline**, **Add steps yourself**, **Name** `Tomorrow's visits with patient details`, **Create and add
   steps**.
2. **Steps**:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `visits` | **Bucket** your bucket; **File** `clinic/visits-tomorrow.csv` |
| 2 | Run pipeline | `lookup` | **Pipeline** the schedule `Patient lookup`; **Call** `each`; **Parameters** `mrn` = `{{mrn}}`; **Answer from** `final`; **Fields**: **Column** `name` **As** `patient_name`, **Column** `clinic` **As** `clinic`; **When a call does not complete** `continue` |
| 3 | Save File | `keep` | **File name** `visits-with-patients.csv` |

3. **Settings**: **Data sensitivity** **Sensitive**. **Validate**, **Save**, **Run now**.

```The Run pipeline step's parameters
mrn = {{mrn}}
```

## Check it worked

- The calling run is **Completed**, 3 of 3 steps: 8 visits read, 8 rows after **Run pipeline**, 8 saved. It takes a
  little longer than most: it waits for each call's run in turn.
- **Run & review › Runs** also lists **eight runs of Patient lookup**, one per visit, each with its own steps and
  outputs (and each billed as a run).
- `visits-with-patients.csv` has each visit with `patient_name` and `clinic` filled in, and four columns about its call:
  `called_run_id`, `called_status`, `called_ok`, `called_error`. The first visit, `SV-000703`, reads `Noah Pryce`,
  `Lakeview clinic`.
- The visit for `SV-000999` has its call's run completed but no answer row, so `patient_name` and `clinic` are empty.
  Add a **Filter** on `patient_name` after step 2 to list such visits for the front desk.

## Common mistakes

- **The Pipeline list does not offer Patient lookup.** It lists schedules: give Patient lookup a schedule (**Only when
  started** is enough), and keep it **Active**.
- **The step is refused before any call.** A parameter it sends is not one the called pipeline declares, or a required
  one is missing: **Parameters** must name `mrn` exactly as on Patient lookup's **Settings** tab.
- **Too many calls.** With `each`, an input needing more calls than **At most calls** (20 unless you say, up to 100)
  fails before any call. Filter the rows first, or call `once`.
- **A chain that calls itself.** Calls go at most 3 deep, and a pipeline already in the chain cannot be called again.
- **One failed call fails the whole run.** Set **When a call does not complete** to `continue`, and branch on
  `called_ok` with a **Filter**.
