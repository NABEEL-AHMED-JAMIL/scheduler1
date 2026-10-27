---
id: rcp-form-trigger
title: A form whose submissions start a pipeline
summary: Build a five-field triage form, a pipeline that reads each submission and warns the charge nurse about abnormal vitals, and link the two with When submitted, start.
section: Building blocks
who: A workspace administrator builds the form and the pipeline; anyone the form is shared with fills it in
where: Get data in › Forms (/forms/builder); Forms › Submissions (/forms/submissions); Build › Pipelines (/pipelines/list)
related: trg-form, form-build, form-starts, form-submissions, rcp-patient-intake, rcp-nightly-new-files
popular: Start a pipeline when a form is sent
---
A form can start a pipeline. Each submission is kept, written to the workspace inbox as a JSON file, and the schedule
the form names runs with it: the pipeline's first step reads the answers as one row, a column per field. Here a nurse's
triage answers are checked the moment they are sent, and only an abnormal reading sends a notice.

## What you'll build

- A form, **Nurse triage (recipe)**, with the fields `mrn`, `temp_c`, `hr`, `spo2` and `notes`.
- A pipeline, **Nurse triage, abnormal vitals**: **Read CSV/JSON/Parquet** (the submission) → **Compute** (the
  `abnormal` flag) → **Filter** (abnormal only) → **Send Notification** to the charge nurse.
- A schedule that runs **Only when started**, named in the form's **When submitted, start**.
- Two test submissions: one abnormal (a notice), one normal (no notice).

Summit Valley's *Nurse triage* form starts *Journey 5 · Nurse triage and abnormal vitals* the same way; its form
settings and notification step are the figures.

## What you need first

- The charge nurse as a person in the workspace (Rosa Alvarez). Find her number: open **Administration › Users**, open
  her page; the number at the end of the page's address (`/administration/users/1045`, say) is what **People** takes.
- The sample files:
  - [triage-test-entries.csv](/help/samples/form-trigger/triage-test-entries.csv): the two entries to type, and what
    each should do.
  - [triage-submission-sample.json](/help/samples/form-trigger/triage-submission-sample.json): a submission as the
    pipeline receives it, for **Test with sample**.

## Build it

### The pipeline and its schedule

1. **Build › Pipelines** → **New pipeline** → **Add steps yourself**, **Name** `Nurse triage, abnormal vitals`,
   **Create and add steps**.
2. Add **Read CSV/JSON/Parquet**: **Key** `submission`, **Name** `The triage submission`, **Bucket** and **File** left
   empty (it reads the run's own file: the submission), **Format** `json`.
3. Add **Compute**: **Key** `score`, one formula, **Column** `abnormal`, **Formula**:

```The abnormal flag
if(number(spo2) < 92 or number(hr) > 110 or number(temp_c) > 38.5, true, false)
```

   Tick **Empty when it cannot be worked out**, so a blank answer does not fail the run.
4. Add **Filter**: **Key** `abnormal_only`, one condition: **Column** `abnormal`, **Is** `eq`, **Value** `true`.
5. Add **Send Notification**: **Key** `tell`.

| Setting | Value |
|---|---|
| **Title** | `Abnormal vitals: {{mrn}}` |
| **Message** | `SpO2 {{spo2}}, HR {{hr}}, temp {{temp_c}}. {{notes}}` |
| **Severity** | `WARNING` |
| **To** | `users` |
| **People** | the charge nurse's number, one per line |
| **Send** | `has_rows` |
| **Link** | `/review/all` |

6. **Save**. Open **Build › Pipelines › Schedules & triggers** → **New schedule**: **Schedule name** `Nurse triage
   (form)`, **Pipeline** `Nurse triage, abnormal vitals`, **When it runs** **Only when started**. **Create schedule**.

![The Send Notification step](rcp-b-triage-step "Summit Valley's Journey 5: the notice's title, message, WARNING, to one named person, only when there are rows")

### The form

1. **Get data in › Forms** → **New form**. On **Settings**, **Name** `Nurse triage (recipe)`.
2. On **Build**, add the fields:

| Type | Label | Key | Required |
|---|---|---|---|
| **Text** | MRN | `mrn` | yes |
| **Number** | Temperature (°C) | `temp_c` | yes |
| **Number** | Heart rate (beats a minute) | `hr` | yes |
| **Number** | SpO2 (%) | `spo2` | yes |
| **Long text** | Notes | `notes` | no |

3. On **Settings**: **Status** **Active**; **When submitted, start** **Nurse triage (form)**; **Approval** **None: no
   approval**.
4. **Save**, then **Publish**.

![A form's Settings: Active, and the schedule it starts](rcp-b-form-settings "Summit Valley's Nurse triage form: Active, When submitted, start Journey 5, no approval, and its dataset")

> **Tip:** The keys are the column names the pipeline sees. Type them exactly as in the table; `{{mrn}}` in the notice
> only works because the key is `mrn`.

## Check it worked

1. Fill in the form twice (its **Fill in**), with the two entries of `triage-test-entries.csv`:
   - SV-000117, 38.9 °C, 112, 91, *Short of breath on exertion*
   - SV-000124, 36.8 °C, 78, 98, *Comfortable*
2. **Forms › Submissions** lists **2** submissions of *Nurse triage (recipe)*, each **Run started** with its run's number.
3. Both runs **Completed**. In the first, **Filter** keeps `1 → 1` and the notice is sent; in the second `1 → 0`, so
   **Send Notification** sends nothing.
4. Rosa Alvarez's bell has one notice, **Abnormal vitals: SV-000117**, *SpO2 91, HR 112, temp 38.9*, opening
   **Review**.
5. The Forms list shows **Nurse triage (form)** in the **Starts** column.

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| The submission says **Received** and no run | **When submitted, start** is **Nothing: keep the submission**, or was not saved. |
| **Run not started**, with a reason under **Details** | The schedule is inactive, or a run of it is still going (it waits its turn). Read the reason. |
| The pipeline reads the wrong file | **Bucket** or **File** is filled in on the read step. Leave both empty to read the submission. |
| No notice for an abnormal entry | **People** holds a name instead of the person's number, or **Send** is `always` on an empty run. |
| `abnormal` is empty for a submission | An answer was blank or not a number, so the formula could not be worked out; the row is not kept by **Filter**. Make the fields **Required**. |
| The form cannot be filled in | Only an **Active**, published form takes submissions. |

> **Note:** Not yet verified end to end: Summit Valley's own form-started triage run (Journey 5) is still waiting to be
> run in the showcase, so the counts above are what the steps do, not a run seen there.
