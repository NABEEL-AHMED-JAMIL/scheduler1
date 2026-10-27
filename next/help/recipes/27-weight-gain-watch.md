---
id: rcp-weight-gain-watch
title: Weight gain watch for heart-failure patients at home
summary: Read only the new bathroom-scale files each morning, work out each patient's gain over the days, and tell the home-health nurse who gained more than 2 kg.
section: Healthcare
who: A workspace administrator builds it; the people the notice names see it in their bell
where: Build › Pipelines (/pipelines/list); Build › Pipelines › Schedules & triggers (/pipelines/schedules)
related: step-read, step-combine, step-outputs, trg-file, trg-schedules, gs-profile
---
A sudden gain in weight can be the first sign that a heart-failure patient is holding fluid. Home-health patients step
on a connected scale every morning and the readings land as one file a day. This recipe reads only the files that came
since the last run, works out each patient's gain from the first to the last reading, and sends a bell notice to the
nurse when anyone gained more than 2 kg. When nobody did, nobody is disturbed.

> **Note:** The patients are synthetic references (`HOME-02`), not people. The 2 kg threshold is the recipe's example,
> not clinical advice.

## What you'll build

A pipeline **Weight gain watch (heart failure)** of six steps and a schedule every morning at 08:30. Its notice reads
"Weight gain over 2 kg: 2 patients".

![The run's steps](rcp-x-weight-run "Summit Valley's run: 72 readings, 12 patients, 2 over the threshold, one notice")

## What you need first

1. **A storage connection**, *your bucket* (see [Connect your storage](#con-storage)).
2. **The sample files**, three days of readings for 12 patients (`patient_ref`, `day`, `weight_kg`):
   [scales-2026-10-24.csv](/help/samples/weight-gain-watch/scales-2026-10-24.csv),
   [scales-2026-10-25.csv](/help/samples/weight-gain-watch/scales-2026-10-25.csv) and
   [scales-2026-10-26.csv](/help/samples/weight-gain-watch/scales-2026-10-26.csv). Two patients gain 1.2 kg a day.
3. **Put them in a folder `home/scales/`** of your bucket with **See results › Analysis › Files** (see
   [Files](#dash-files)).
4. **The nurse who is told**: a person of the workspace (this recipe uses Tamara Brooks, a home-health nurse; pick
   anyone, yourself included).

## Build it

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Weight gain watch (heart failure)`, **Create
   and add steps**.
2. Add the six steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `scales` | **Bucket** your bucket; **Prefix** `home/scales/`; **Read as** `csv`; **Which objects** `last_run` |
| 2 | Sort | `ordered` | **Sort by** `patient_ref` `asc`, then `day` `asc` |
| 3 | Aggregate | `range` | **Group by** `patient_ref`. **Aggregations**: `first` of `weight_kg` as `first_kg`; `last` of `weight_kg` as `last_kg` |
| 4 | Compute | `gain` | **Column** `gain_3d`, **Formula** `round(last_kg - first_kg, 1)` |
| 5 | Filter | `over` | **Column** `gain_3d`, **Is** `gt`, **Value** `2` |
| 6 | Send Notification | `tell` | The settings below |

The **Send Notification** step:

- **Title** `Weight gain over 2 kg: {{rows}} patients`
- **Message** `Heart-failure watch: call them today.`
- **Severity** `WARNING`
- **To** `users`, **People** the nurse
- **Send** `has_rows` (only when someone is over the threshold)
- **Link** `/runs/latest`

3. **Settings**: **Data sensitivity** **Sensitive**. **Validate**, **Save**.
4. **Schedule**: **On a timetable**, **Daily** at `08:30`, **Create schedule**. Choose **Run now** to try it today.

## Check it worked

The first run is **Completed**, 6 of 6 steps:

| Step | Rows in → out |
|---|---|
| Read S3 (the three files) | 0 → 36 |
| Sort | 36 → 36 |
| Aggregate | 36 → 12 |
| Compute | 12 → 12 |
| Filter: gain over 2 kg | 12 → **2** |
| Send Notification | 2 → 2 |

The nurse's bell shows **Weight gain over 2 kg: 2 patients** (a warning). The two are `HOME-02` and `HOME-05`, each
2.4 kg heavier on the 26th than on the 24th: open the run's **Filter** step output to see them.

Choose **Run now** again without adding a file: **Read S3** reads 0 objects, every later step has 0 rows, and no notice
is sent. Add tomorrow's file to `home/scales/` and the next run reads that one only.

Summit Valley's run read 72 readings (six days) for its 12 home patients; the same two patients crossed the threshold,
and the notice went to Tamara Brooks.

## Common mistakes

- **The gain is measured over the wrong days.** **first** and **last** follow the rows' order, so the **Sort** by
  `patient_ref` then `day` must come before **Aggregate**.
- **Every run reads all the files.** **Which objects** is `all`. Set `last_run` so each run takes only what is new; a
  run that failed moves nothing on, so its files come again.
- **A run with nobody over the threshold still sends a notice.** **Send** must be `has_rows`, not `always`.
- **The notice reaches nobody.** With **To** `users`, pick the **People** by name; `owner` means the schedule's owner,
  `admins` the workspace's administrators.
