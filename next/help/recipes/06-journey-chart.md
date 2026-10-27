---
id: rcp-journey-chart
title: "Patient journey 6: the health chart report and the dashboard"
summary: One report that brings every stage of a stay together, and an hourly feed that turns the journey's runs into a dashboard of length of stay, risk, vitals and time per stage.
section: The patient journey
who: A workspace administrator builds it; anyone whose page access includes Reports or Dashboards reads it
where: See results › Reports › Templates (/reports/templates); See results › Reports › Library (/reports/library); See results › Analysis › Analytics Studio (/data/analytics); See results › Dashboards (/data/analytics/dashboards)
related: rcp-journey-discharge, rcp-journey-referral, tour-health-chart, tour-dashboard, step-read, step-combine, dash-build, dash-data-sources, dash-studio
---
Each stage of the journey kept its own file. This last recipe puts them back together twice: once as a report for one
patient, the health chart, and once as a board for every patient on the journey.

## What you'll build

- The template **Patient health chart**: a timeline of the stages, a chart of the vital signs, the lab results as a
  table, the wound photo and X-ray with their measurements, the medicines, the care plan and the discharge.
- The pipeline **Journey 14 · The patient's health chart (Patient 360)**, run on demand for one MRN and a period.
- The pipeline **Journey 15 · Cohort stages for the dashboard**, every hour: one row per patient with the time each
  stage ended, hours to each stage and the length of stay, written to two files.
- The board **Patient journey** with six widgets.

![The cohort feed's run](rcp-j-cohort-run "Journey 15's run: each stage's files and runs read, joined, pivoted to one row a patient, and unpivoted for the chart")

## What you need first

- Recipes 1 to 5 done for at least one patient, so every folder under `journey/` has a file.
- Each journey pipeline's id. The **Read runs** step names a pipeline by its id; a pipeline's page shows it (for
  example **Defined for** and the id on its **Steps** tab).

## Build it

### The health chart template

1. In **Reports › Templates** choose **New template** and name it `Patient health chart`, "Every stage of one patient's
   journey in one chart".
2. Lay out, in this order: the patient's name and MRN and the period (`{{report.period}}`); a **Repeat for each** row
   of the timeline (stage, status, when); a **Chart** of type **Line**, the vital signs over time (`taken_at` as the
   category, `spo2` and `hr` as values); a **Table** of the lab results (test, value, unit, abnormal); an **Image
   grid** with **Pictures from** the data, **Picture field** `image_key`, captions from the measurements; a list of the
   medicines; the care plan's goals and interventions; and the discharge course.
3. Test it with one run's rows, keep them as a test sample, and **Publish v1**.

### The health chart pipeline

Make `Journey 14 · The patient's health chart (Patient 360)` with three run parameters: `mrn` (Text, default
`SV-000117`), `from` and `to` (Date, defaults `2026-10-19` and `2026-10-31`). Then these 19 steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 to 8 | Read S3, eight times | `reg`, `tri`, `labs`, `img`, `wnd`, `meds`, `cp`, `dis` | **Prefix** `journey/<folder>/{{param.mrn}}` for `patients`, `triage`, `labs`, `imaging`, `wound`, `medsafety`, `careplans` and `discharge`; **Read as** json or csv as each folder holds; **At most objects** 50 |
| 9 | Read CSV/JSON/Parquet | `prog` | **File** `journey/progress/progress.csv` |
| 10 | Filter | `prog_mine` | `mrn` equals `{{param.mrn}}` |
| 11 to 13 | Read runs, three times | `r4`, `r9`, `r12` | **Pipeline**: the ids of Journey 4, 9 and 12; **Runs of the last (days)** 60 |
| 14 | Append (union) | `runs` | **Steps to stack** `r4`, `r9`, `r12`; **Columns** common; **Source column** `pipeline` |
| 15 | Compute | `runs_stage` | `stage = 'run'`, `mrn = '{{param.mrn}}'`, `status = concat(pipeline, ': ', status)` |
| 16 | Append (union) | `every` | **Steps to stack** `runs_stage`, `prog_mine`, `reg`, `tri`, `labs`, `img`, `wnd`, `meds`, `cp`, `dis`; **Columns** all |
| 17 | Filter | `period` | **Keep a row that meets** any: `mrn` equals `{{param.mrn}}`; `stage` equals `run` |
| 18 | Compute | `images` | `has_image = if(is_null(image_key), 0, 1)` |
| 19 | Generate report | `chart` | **Use a saved template** Patient health chart; **Period** `{{param.from}} – {{param.to}}`; **Report name** `Patient health chart · {{param.mrn}}`; **Formats** PDF; **JSON columns** `goals`, `interventions`, `meds_on_discharge` |

Give it a schedule **Only when started**. Run it with **Run with…** and the three values, or let the workflow run it
last.

### The cohort feed

Make `Journey 15 · Cohort stages for the dashboard` (**Data sensitivity** Internal) with a schedule **Hourly**. For each
of the six stages below, add the same four steps:

| Step | Settings |
|---|---|
| Read S3 | **Prefix** the stage's folder, **Read as** list, **At most objects** 200 |
| Compute | `mrn = regex_extract(key, '(SV-[0-9]{6})')`, `run_id = regex_extract(key, 'run-([0-9]+)')`, `stage = '<stage>'` |
| Read runs | **Pipeline** the stage's pipeline id, **Runs of the last (days)** 60, **Include runs still queued or running** on |
| Join | **Reads** the Compute step; **Join with** the Read runs step **On** `run_id`; **Keep** left; **Prefix for clashing columns** `run_` |

| Stage | Folder | Pipeline |
|---|---|---|
| `registration` | `journey/patients/` | Journey 4 |
| `triage` | `journey/triage/` | Journey 5 |
| `labs` | `journey/labs/` | Journey 6 |
| `imaging` | `journey/imaging/` | Journey 8 |
| `careplan` | `journey/careplans/` | Journey 9 |
| `discharge` | `journey/discharge/` | Journey 12 |

Then, after the 24 stage steps, these eleven:

| # | Step | Key | Settings |
|---|---|---|---|
| 25 | Append (union) | `all` | The six Join steps; **Columns** common |
| 26 | Compute | `when` | `ended = coalesce(run_ended_at, ended_at, run_created_at, created_at)` |
| 27 | Pivot (rows to columns) | `wide` | **Row per** `mrn`; **Names from** `stage`; **Values from** `ended`; **When a group has several** max; **Only these** `registration`, `triage`, `labs`, `imaging`, `careplan`, `discharge` |
| 28 | Compute | `los` | `triage_hours = date_diff(registration, triage, 'hour')`, and the same for `labs_hours`, `imaging_hours`, `careplan_hours`, `discharge_hours`; `length_of_stay_days = round(date_diff(registration, discharge, 'hour') / 24, 1)` |
| 29 | Read S3 | `plans` | **Prefix** `journey/careplans/`, **Read as** json |
| 30 | Remove duplicates | `risk_last` | **Key columns** `mrn`; **Keep** last |
| 31 | Select columns | `risk` | `mrn`, and `risk` as `readmission_risk` |
| 32 | Join | `with_risk` | **Reads** `los`; **Join with** `risk` **On** `mrn`; **Keep** left |
| 33 | Upload to bucket | `keep` | **Object key** `journey/dashboard/stages.csv`, **Format** csv |
| 34 | Unpivot (columns to rows) | `long` | **Columns to turn into rows** the five `_hours` columns; **Name column** `stage`; **Value column** `hours`; **Keep empty values** off |
| 35 | Upload to bucket | `keep_long` | **Object key** `journey/dashboard/stage_hours.csv`, **Format** csv |

### The board

1. In **See results › Analysis › Analytics Studio**, open each file below, write its query on the **SQL** tab, and
   save it under **Name this query** ([Explore a file in Analytics Studio](#dash-studio)).
2. In **See results › Dashboards** choose **New dashboard**: **Name** `Patient journey`, **What it is for** "Length of
   stay, readmission risk, vitals and time per stage (synthetic patients)". Choose **Create**.
3. Add one widget per query with ⋯ › **Add a widget**, **A saved query**, and the kind below
   ([Build and edit a dashboard](#dash-build)).

| Widget | File | Query | Drawn as |
|---|---|---|---|
| Patients on the journey | `journey/dashboard/stages.csv` | `SELECT 'Patients' AS metric, count(*) AS value FROM dataset` | A single figure |
| Average length of stay (days) | `journey/dashboard/stages.csv` | `SELECT 'LOS days' AS metric, round(avg(length_of_stay_days), 1) AS value FROM dataset` | A single figure |
| Readmission risk (care plans) | `journey/dashboard/stages.csv` | `SELECT coalesce(readmission_risk, 'not yet') AS risk, count(*) AS patients FROM dataset GROUP BY 1` | A table, or a doughnut |
| Hours to each stage | `journey/dashboard/stage_hours.csv` | `SELECT stage, round(avg(hours), 1) AS hours FROM dataset GROUP BY 1 ORDER BY 2` | Bar |
| SpO2 by day (all patients) | `journey/progress/progress.csv` | The query below | Line |
| Each patient's stages | `journey/dashboard/stages.csv` | `SELECT * FROM dataset ORDER BY mrn` | Table |

```Query: SpO2 by day (all patients)
SELECT CAST(CAST(taken_at AS TIMESTAMP) AS DATE) AS day, round(avg(spo2), 1) AS spo2, round(avg(hr), 1) AS hr FROM dataset GROUP BY 1 ORDER BY 1
```

> **Note:** The SpO2 query above reads the time as a date first. Summit Valley's board cut the first ten characters of
> the time instead, which fails when the file's times are read as dates and times. Not yet verified end to end.

## Check it worked

1. Run Journey 14 with `mrn` `SV-000117`: 19 of 19 steps completed, about 94 rows into the report step. **Reports ›
   Library** has **Patient health chart · SV-000117**, with the timeline, the vitals chart, the labs and the pictures.
2. Run Journey 15 with **Run now**: 35 of 35 steps. `journey/dashboard/stages.csv` has one row per patient on the
   journey, with `readmission_risk` **High** for Elena Marsh; `stage_hours.csv` has one row per stage reached.
3. Open the board: **Patients on the journey** counts the patients, **Readmission risk** lists High, and **Files this
   board reads** lists the three files. **Made by** names Journey 15 and its last run.
4. With more patients through the journey (the tour's cohort has ten), the length of stay and the hours per stage
   fill in.

## Common mistakes

- **The report is cut off at the page limit.** Every page counts toward the workspace's limit for one report (300
  unless an administrator set fewer). Narrow the period, or the rows.
- **A picture prints as a placeholder.** The image key in the data does not point at a file in the bucket; the run
  warns and names it ([A missing picture or field](#ts-documents--a-missing-picture-or-field)).
- **A widget says "Nothing to read at …".** Journey 15 has not written the file yet: run it, then **Run every
  widget**.
- **The hours are all empty.** `date_diff` needs both stages; a patient not yet discharged has no length of stay. That
  is expected.
- **Read runs refuses.** It is an administrator's step, and it names the pipeline by its id, not its name.

> **Tip:** Run the cohort feed hourly and leave it: each run replaces both files, so the board is never older than an
> hour.

Back to the start: [Patient journey 1](#rcp-journey-referral). The story these recipes build is told in the tour,
from [A referral arrives by email](#tour-referral).
