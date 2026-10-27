---
id: rcp-journey-ward
title: "Patient journey 3: on the ward: triage, vitals, labs, wound photo and X-ray"
summary: The nurse triage form and its scoring pipeline, a daily vitals schedule with a backfill, lab results from a partner, a wound photo measured in code, and an X-ray reviewed one by one.
section: The patient journey
who: A workspace administrator builds it; nurses fill the form and drop photos; reviewers decide
where: Get data in › Forms (/forms/builder); Get data in › Documents › Intake › File drop (/documents/intake/file-drop); Build › Pipelines › Schedules & triggers (/pipelines/schedules); Run & review › Review (/review/all)
related: rcp-journey-registration, rcp-journey-care-plan, tour-triage, tour-ward, tour-diagnostics, step-ai, step-people, trg-file, trg-backfills
---
While the patient is on the ward, five pipelines fill her folder: the nurse's triage, the daily vital signs, the lab
results, the wound photo and the chest X-ray. Each is started its own way (a form, a timetable, an event, a dropped
file) and each result a model drafts is checked by a person. Recipe 4's care plan reads what they keep.

## What you'll build

| Pipeline | Starts when | Keeps in your bucket | A person |
|---|---|---|---|
| Journey 5 · Nurse triage and abnormal vitals | The **Nurse triage** form is sent | `journey/triage/` | The charge nurse is told about abnormal vitals |
| Journey 11 · Daily progress and threshold alerts | Every day at 07:00, and a backfill for the days already past | `journey/progress/progress.csv` | Ward 4B nursing is told when a reading crosses its threshold |
| Journey 6 · Lab results from the partner lab | The partner sends a lab result event | `journey/labs/` | A physician reviews each run |
| Journey 7 · Wound photo: measure, describe, wound-care review | A wound photo is dropped | `journey/wound/`, and a report per photo | Wound care approves the measurement |
| Journey 8 · Chest X-ray triage with radiologist review | An X-ray is dropped | `journey/imaging/` | The radiologist reviews each run on its own |

![The wound photo pipeline as a flow](rcp-j-wound-flow "Journey 7 in the Flow view: read the photo, measure it in code, describe it as a DRAFT, compare, approve, report")

## What you need first

- Recipes 1 and 2 done; the teams Ward 4B nursing, Wound care, Radiology and Physicians.
- A vision model on your model connection, for the wound and X-ray steps.
- These files. Upload the first three groups with **See results › Analysis › Files**; the photo and the X-ray are
  dropped later, in the steps.

| File | Where it goes |
|---|---|
| [vitals-2026-10-19.csv](/help/samples/patient-journey/vitals-2026-10-19.csv), [-20](/help/samples/patient-journey/vitals-2026-10-20.csv), [-21](/help/samples/patient-journey/vitals-2026-10-21.csv), [-22](/help/samples/patient-journey/vitals-2026-10-22.csv), [-23](/help/samples/patient-journey/vitals-2026-10-23.csv) | `journey/vitals/` (four readings a day for ten patients; Elena's SpO2 is 88 on day 3) |
| [progress.csv](/help/samples/patient-journey/progress.csv) | `journey/progress/progress.csv` (the readings before admission) |
| [wound-history.csv](/help/samples/patient-journey/wound-history.csv) | `journey/wound/history.csv` (the wound's first visit) |
| [triage-vitals-sample.json](/help/samples/patient-journey/triage-vitals-sample.json) | Pasted into a data contract (below) |
| [lab-results.json](/help/samples/patient-journey/lab-results.json) | Six lab results your partner (or a developer) sends as events |
| [wound-SV-000117-v2.jpg](/help/samples/patient-journey/wound-SV-000117-v2.jpg) | Dropped in **File drop**: a synthetic wound photo with a 1 cm ruler |
| [chest-xray-SV-000117.png](/help/samples/patient-journey/chest-xray-SV-000117.png) | Dropped in **File drop**: a synthetic test picture, not a radiograph |

## Build it

### Triage: the form and its pipeline

1. Make the data contract `triage_vitals` from `triage-vitals-sample.json` with **New from sample**, as in recipe 1;
   tick **Required** on `mrn`, `temp_c`, `hr` and `spo2`.
2. Make the pipeline `Journey 5 · Nurse triage and abnormal vitals` with the seven steps below, **Data sensitivity**
   **Sensitive**, and a schedule **Only when started**.
3. Build the form **Nurse triage** on **Get data in › Forms** ([Build a form](#form-build)) with the fields below. In
   its **Settings**, under **When submitted, start**, choose the Journey 5 schedule. Set **Status** **Active** and
   **Save**.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `submission` | **Bucket** and **File** empty (the submission), **Format** json |
| 2 | Transform | `numbers` | **cast** to number, empty when not a number: `temp_c`, `hr`, `sbp`, `dbp`, `spo2`, `rr`, `pain`; **Keep the other columns** on |
| 3 | Validate | `check` | **Contract** `triage_vitals`; **Rows that do not hold**: flag |
| 4 | Compute | `score` | The three formulas below |
| 5 | Upload to bucket | `keep` | **Object key** `journey/triage/{{mrn}}-run-{{run}}.csv`, **Format** csv, **One file per row** on |
| 6 | Filter | `abnormal_only` | `abnormal` equals `true` |
| 7 | Send Notification | `tell` | **Title** `Abnormal vitals: {{mrn}}`; **Message** `SpO2 {{spo2}}, HR {{hr}}, temp {{temp_c}}; early-warning score {{ews}}.`; **Severity** `WARNING`; **To** `users`, the charge nurse; **Send** `has_rows`; **Link** `/review/all` |

```Compute: the early-warning score, in code
ews      = if(spo2 < 92, 3, if(spo2 < 95, 1, 0)) + if(hr > 110, 2, if(hr > 90, 1, 0)) + if(temp_c > 38, 1, 0) + if(rr > 24, 2, 0)
abnormal = if(spo2 < 92 or hr > 110 or temp_c > 38.5, true, false)
stage    = 'triage'
```

| Field | Key | Type | Required |
|---|---|---|---|
| MRN | `mrn` | Text (placeholder `e.g. SV-000123`) | Yes |
| Temperature (°C) | `temp_c` | Number | Yes |
| Heart rate | `hr` | Number | Yes |
| Systolic BP, Diastolic BP | `sbp`, `dbp` | Number | No |
| SpO2 (%) | `spo2` | Number | Yes |
| Respiratory rate | `rr` | Number | No |
| Pain score | `pain` | Number (0 to 10) | No |
| Allergies | `allergies` | Text | No |
| Fall risk | `fall_risk` | Choice: `low`, `medium`, `high` | Yes |
| Nurse's signature | `signature` | Signature | No |

### The daily vitals, and a backfill

1. Make the pipeline `Journey 11 · Daily progress and threshold alerts` with the steps below.
2. Make its schedule: **On a timetable**, **Daily**, every 1 day at `07:00`.
3. From the schedule's **⋮** menu choose **Backfill…**: **Dates** `2026-10-19` to `2026-10-23`, **One run per**
   **Day**, **At once** `2`. Read the **Preview** (five periods) and choose **Start**.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `new` | **Prefix** `journey/vitals/vitals-{{run.date}}`, **Read as** csv, **Which objects** `last_run`, **At most objects** 10 |
| 2 | Read CSV/JSON/Parquet | `so_far` | **File** `journey/progress/progress.csv` |
| 3 | Append (union) | `together` | **Steps to stack** `so_far`, `new`; **Columns** common |
| 4 | Sort | `ordered` | `mrn`, then `taken_at` |
| 5 | Remove duplicates | `unique` | **Key columns** `mrn`, `taken_at`; **Keep** last |
| 6 | Fill missing values | `gaps` | `spo2` and `hr` from the previous value |
| 7 | Compute | `crossed` | `day = date_trunc(taken_at, 'day')`, `crossed = if(spo2 < 90 or hr > 115, true, false)`, `stage = 'progress'` |
| 8 | Upload to bucket | `keep` | **Object key** `journey/progress/progress.csv`, **Format** csv |
| 9 | Filter | `alerts` | `crossed` equals `true`, and `day` starts with `{{run.date}}` |
| 10 | Send Notification | `tell` | **Title** `Vitals crossed a threshold ({{run.date}})`; **Severity** `WARNING`; **To** the Ward 4B nurses; **Send** `has_rows` |
| 11 | Send webhook (optional) | `bedside` | A webhook to your bedside alert system, **Send** `rows`, **Columns** `mrn`, `taken_at`, `spo2`, `hr`, **Fail unless delivered** on ([Webhooks](#dev-webhooks)) |

### Lab results from the partner lab

1. Make the data contract `lab_result` from one record of `lab-results.json`; tick **Required** on `result_id`,
   `patient_ref`, `loinc` and `value`.
2. Make the pipeline `Journey 6 · Lab results from the partner lab` with the steps below. On **Settings**, under
   **Results need review by**, tick **Our team**; the Physicians team is asked through **Approval workflows › Pipeline
   run review** ([Review a run's results](#apr-run-review)).
3. Give it a schedule **Only when started**, and an event route: **Event type** `lab.result.created`, **Starts** **A
   pipeline's run** (this pipeline), **Data contract** `lab_result` ([Events and event routes](#dev-events)).
4. Your partner, or a developer with an API client that has `events:write`, sends each record of `lab-results.json` as
   one `lab.result.created` event.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `intake` | **Bucket** and **File** empty (the event's record), **Format** json |
| 2 | Validate | `check` | **Contract** `lab_result`; **Rows that do not hold**: fail |
| 3 | Compute | `flag` | `abnormal = if(value > reference_high or value < reference_low, true, false)`; `critical = if((loinc == '4548-4' and value >= 9) or (loinc == '2823-3' and value >= 6), true, false)`; `mrn = patient_ref`; `stage = 'labs'` |
| 4 | Upload to bucket | `keep` | **Object key** `journey/labs/{{mrn}}-run-{{run}}.csv`, **Format** csv, **One file per row** on |
| 5 | Filter | `critical_only` | `critical` equals `true` |
| 6 | Send Notification | `tell` | **Title** `Critical lab: {{test_name}} {{value}} {{unit}} ({{mrn}})`; **Severity** `ERROR`; **To** the physicians; **Send** `has_rows` |

### The wound photo

1. Save the prompt **Wound description (DRAFT)** under **Build › Pipelines › Prompts** ([Write and test a
   prompt](#ai-prompts)) with the text below, your vision model, **Temperature** 0.1, and the answer as a **JSON
   object** with the schema below. Add the variables `mrn`, `length_cm` and `width_cm`. Choose **Save & activate**.
2. Make a Report Studio template **Wound assessment** that shows the photo, the length, width and area, the change since
   the last visit and the DRAFT description, and publish it ([Templates and the library](#rs-templates)).
3. Make the pipeline `Journey 7 · Wound photo: measure, describe, wound-care review` with the steps below.
4. Give it a schedule **Only when started**; under **Also starts when**, tick **A file arrives**, **Which files**
   `wound-SV-000117-*`, **Files per run** `1` ([Start a pipeline when a file arrives](#trg-file)).

```System instructions: Wound description (DRAFT)
You describe a synthetic or public research image for a clinician, who checks every answer. Describe only what is visible. Your answer is a DRAFT, never a diagnosis.
```

```Message template: Wound description (DRAFT)
Synthetic wound photo for {{mrn}}; measured in code {{length_cm}} x {{width_cm}} cm. Write stage (1, 2, 3, 4 or unstageable), tissue (granulation, slough or mixed), exudate (none, light, moderate or heavy) and description (one sentence).
```

```Output schema: Wound description (DRAFT)
{ "type": "object", "properties": { "stage": { "type": "string" }, "tissue": { "type": "string" }, "exudate": { "type": "string" }, "description": { "type": "string" } }, "required": ["stage", "tissue", "exudate", "description"] }
```

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `photo` | **Prefix** `intake/`, **Read as** list, **The run's own files first** on |
| 2 | Compute | `ids` | `mrn = regex_extract(key, '(SV-[0-9]{6})')`, `visit_date = today()`, `stage = 'wound'` |
| 3 | Measure image | `measure` | **Image**: your bucket, **Image key column** `key`; **What to measure** `red_region` |
| 4 | AI prompt | `describe` | **Prompt** Wound description (DRAFT); **Image**: your bucket, **Image key column** `key`; **Fields** `stage` as `stage_draft`, `tissue`, `exudate`, `description`; **When a row fails** `null` |
| 5 | Read CSV/JSON/Parquet | `history` | **File** `journey/wound/history.csv` |
| 6 | Remove duplicates | `last` | **Reads** `history`; **Key columns** `mrn`; **Keep** last |
| 7 | Join | `joined` | **Reads** `describe`; **Join with** `last` **On** `mrn`; **Keep** left; **Prefix for clashing columns** `prev_` |
| 8 | Compute | `change` | `area_change_pct = round((area_cm2 - prev_area_cm2) * 100 / prev_area_cm2, 1)` (empty when it cannot be worked out), `image_key = key` |
| 9 | Upload to bucket | `keep` | **Object key** `journey/wound/{{mrn}}-run-{{run}}.json`, **Format** json, **One file per row** on |
| 10 | Approval | `approve` | **Task title** `Wound {{mrn}}: {{area_cm2}} cm²`; **What to check** "Check the measurement against the photo, then approve."; **Fields** Length (cm) `{{length_cm}}`, Width (cm) `{{width_cm}}`, Change (%) `{{area_change_pct}}`, DRAFT `{{description}}`; **Reviewers** the Wound care team; **Decide within (hours)** 24 |
| 11 | Generate report | `report` | **Use a saved template** Wound assessment; **One report per row** on; **Report name** `Wound · {{mrn}} · {{visit_date}}`; **Formats** PDF |

### The chest X-ray

1. Save the prompt **Chest X-ray triage (DRAFT)** with the same system instructions as the wound prompt, your vision
   model, and the message and schema below.
2. Make the pipeline `Journey 8 · Chest X-ray triage with radiologist review` with the steps below. On **Settings**,
   tick **Our team** under **Results need review by** and **Requires individual review (never approved or rejected in
   bulk)**; the Radiology team is asked.
3. Give it a schedule **Only when started** that also starts when a file arrives: **Which files** `chest-xray-SV-*`.

```Message template: Chest X-ray triage (DRAFT)
Chest X-ray {{image_id}}. finding: normal or pneumonia. urgency: routine or review first. confidence: low, medium or high. description: one short sentence.
```

```Output schema: Chest X-ray triage (DRAFT)
{ "type": "object", "properties": { "finding": { "type": "string", "enum": ["normal", "pneumonia"] }, "urgency": { "type": "string", "enum": ["routine", "review first"] }, "confidence": { "type": "string", "enum": ["low", "medium", "high"] }, "description": { "type": "string" } }, "required": ["finding", "urgency", "confidence", "description"] }
```

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `image` | **Prefix** `intake/`, **Read as** list, **The run's own files first** on |
| 2 | Compute | `ids` | `image_id = regex_extract(key, '([^/]+)[.][a-z]+$')`, `mrn = regex_extract(key, '(SV-[0-9]{6})')`, `stage = 'imaging'` |
| 3 | AI prompt | `triage` | **Prompt** Chest X-ray triage (DRAFT); **Image**: your bucket, **Image key column** `key`; **Fields** `finding`, `urgency`, `confidence`, `description`; **When a row fails** `null` |
| 4 | Compute | `first` | `review_first = if(urgency == 'review first' or finding == 'pneumonia', true, false)`, `image_key = key` |
| 5 | Upload to bucket | `keep` | **Object key** `journey/imaging/{{mrn}}-run-{{run}}.json`, **Format** json, **One file per row** on |

### Use them

1. As Rosa Alvarez, open the **Nurse triage** task in **Review › Approvals**, fill the form for `SV-000117` with
   temperature `38.1`, heart rate `112`, SpO2 `91`, respiratory rate `22`, pain `6`, fall risk `high`, and mark the task
   done.
2. As Daniel Kim, drop `wound-SV-000117-v2.jpg` and `chest-xray-SV-000117.png` on **Get data in › Documents › Intake ›
   File drop**.
3. Have the lab results sent (step 4 of the lab part).

## Check it worked

- **Triage.** **Forms › Submissions** shows the submission with **Run started**. The run (7 steps) keeps
  `journey/triage/SV-000117-run-<run>.csv`; SpO2 91, heart rate 112 and a temperature of 38.1 make it abnormal, with an early-warning score of 6, and the charge nurse
  has an **Abnormal vitals: SV-000117** notice under the bell.
- **Vitals.** **Run & review › Runs › Backfills** shows five days completed; the schedule has five runs of 11 steps.
  The day 2026-10-21 run sends **Vitals crossed a threshold (2026-10-21)**: Elena's SpO2 88.
- **Labs.** Six runs, one per result, each waiting for review. The HbA1c of 9.4 % is critical: the physicians get the
  notice. Dr. Patel approves each in **Review › Runs**; the run then reads **Completed · approved**.
- **Wound.** The run measures the wound (about 3.6 × 2.3 cm, smaller than the first visit's 4.2 × 2.8) and waits at
  its Approval step. Sam Harper approves it in **Review › Approvals**; the run goes on, 11 of 11 steps completed, and
  makes one PDF, **Wound · SV-000117 · <date>**, in **Reports › Library**.
- **X-ray.** The run completes with its review **Pending** in **Review › Runs**; bulk approve skips it. Dr. Schmidt
  approves it on its own.

## Common mistakes

- **The form starts nothing.** The form must be **Active** and its **When submitted, start** must name the Journey 5
  schedule; **Forms › Submissions** says **Run not started** and why.
- **Every vital is empty.** The **Transform** step must keep the other columns and cast each field by its form key
  (`temp_c`, not "Temperature").
- **The backfill reads the same file every day.** The **Read S3** prefix must hold `{{run.date}}`, so each day's run
  reads that day's file.
- **The photo starts the wrong pipeline.** File patterns decide: a photo named `wound-SV-000117-…` starts Journey 7,
  an image named `chest-xray-SV-…` Journey 8. Rename the file, not the pattern.
- **The wound has no size.** **Measure image** needs the ruler in the photo, and `red_region` for a red wound on
  lighter skin; a photo too dark to read gives empty sizes with the reason in `measure_note`.
- **The Approval step's reviewers.** The step asks for a role or a team's id. While you test, leave **Reviewers**
  empty: the workspace's administrators decide.
- **The model's answer is "held for review".** The answer did not fit the schema; keep the schema small (see
  [Write and test a prompt](#ai-prompts--ask-for-a-json-answer)).

> **Warning:** The vision model only describes; the size is measured in code, and a person approves both. The X-ray
> picture in the samples is a drawing for testing, so its DRAFT finding means nothing.

Next: [Patient journey 4: the care plan](#rcp-journey-care-plan).
