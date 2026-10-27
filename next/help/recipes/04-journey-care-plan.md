---
id: rcp-journey-care-plan
title: "Patient journey 4: the care plan, the senior-doctor rule and out of office"
summary: An AI care-plan draft from everything the ward kept, the attending physician's approval with a stand-in, a senior physician only when the risk is High, and the pharmacist's medication check.
section: The patient journey
who: A workspace administrator builds it; physicians and pharmacists decide
where: Build › Pipelines › Prompts (/pipelines/prompts); Build › Approval workflows (/workflows/designer); Run & review › Review › Approvals (/review/approvals)
related: rcp-journey-ward, rcp-journey-discharge, tour-care-plan, ai-prompts, ai-steps, apr-workflows, apr-who-decides, adm-out-of-office
---
With registration, triage, labs and imaging in the patient's folder, the workflow asks for a care plan. A model drafts
it; people decide it. Who decides depends on what the plan says and on who is in: the attending physician (or her
stand-in), a senior physician as well when the risk is High, and a pharmacist for the medicines.

## What you'll build

- The prompt **Care plan (DRAFT)**, which answers a JSON object: `risk`, `goals`, `interventions` and `follow_up`.
- The pipeline **Journey 9 · Care-plan draft**. It gathers the patient's lab, triage and imaging findings, asks the
  model for the draft, and then sets the risk **by a rule in code** (HbA1c 9 or more, or SpO2 below 90, is High),
  keeping the model's own word beside it as `risk_draft`.
- The pipeline **Journey 10 · Medication safety check**: each of the patient's medicines against a synthetic
  interaction list, the flagged pairs held at an Approval step for the pharmacy.
- Six more workflow steps: **Care-plan draft (AI)**, **Attending physician approves the care plan**, **High risk in
  the care plan?**, **Senior physician approves**, **Medication safety check** and **Tell the ward**.

![The care plan's AI answer](rcp-j-careplan-ai "Journey 9's AI answers tab: the Care plan (DRAFT) answer, its time and tokens. The model said Low; the rule in code made it High (fictional patient)")

## What you need first

- Recipes 1 to 3 done, so the folder holds `journey/patients/`, `journey/labs/`, `journey/triage/` and
  `journey/imaging/` for Elena Marsh.
- A text model on your model connection.
- [interactions.csv](/help/samples/patient-journey/interactions.csv), uploaded to `reference/interactions.csv`: 120
  ingredient pairs with a severity. Synthetic, for demonstration only, not clinical advice.

## Build it

### The prompt

1. Open **Build › Pipelines › Prompts** and choose **New prompt**. **Name** `Care plan (DRAFT)`, **Data sensitivity**
   Sensitive, your text model, **Temperature** 0.1, **Max tokens** 500.
2. Paste the system instructions and the message template below. Add the variables `name`, `mrn`, `age`, `reason` and
   `findings` (all text), with the sample values `Elena Marsh`, `SV-000117`, `67`, `Diabetic foot wound` and
   `labs: HbA1c 9.4`.
3. Set **The answer** to **JSON object** and paste the schema.
4. Choose **Run** under **Try it**. The answer is a JSON object with the four keys; check **Show rendered input**.
5. Choose **Save & activate**.

```System instructions: Care plan (DRAFT)
You write short DRAFT notes for a person at a fictional hospital group, who checks and corrects every one. Use only the facts given; write 'not recorded' for anything missing. Never diagnose or prescribe. All data is synthetic.
```

```Message template: Care plan (DRAFT)
Patient {{name}} ({{mrn}}), {{age}} years. Reason for admission: {{reason}}. Findings by stage: {{findings}}. Write risk (Low, Moderate or High: High when SpO2 fell below 90 or HbA1c is 9 or more or an X-ray needs review), goals (2-4 short goals), interventions (2-5 short items), follow_up (one sentence).
```

```Output schema: Care plan (DRAFT)
{ "type": "object", "properties": { "risk": { "type": "string", "enum": ["Low", "Moderate", "High"] }, "goals": { "type": "array", "items": { "type": "string" } }, "interventions": { "type": "array", "items": { "type": "string" } }, "follow_up": { "type": "string" } }, "required": ["risk", "goals", "interventions", "follow_up"] }
```

### The care-plan pipeline

Make `Journey 9 · Care-plan draft` with the run parameter `mrn` (Text, default empty), **Data sensitivity**
**Sensitive**, a schedule **Only when started**, and these 18 steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `records` | **Prefix** `journey/patients/{{param.mrn}}`, **Read as** json, **At most objects** 50 |
| 2 | Remove duplicates | `new` | **Key columns** `mrn`; **Keep** last |
| 3 | Compute | `only_flag` | `wanted = if('{{param.mrn}}' == '' or mrn == '{{param.mrn}}', 1, 0)` |
| 4 | Filter | `only` | `wanted` equals `1` |
| 5 | Read S3 | `labs` | **Prefix** `journey/labs/`, **Read as** csv, **At most objects** 200 |
| 6 | Read S3 | `triage` | **Prefix** `journey/triage/`, **Read as** csv, **At most objects** 200 |
| 7 | Read S3 | `imaging` | **Prefix** `journey/imaging/`, **Read as** json, **At most objects** 200 |
| 8 | Append (union) | `all` | **Steps to stack** `labs`, `triage`, `imaging`; **Columns** all; **Source column** `source_step` |
| 9 | Compute | `line` | `finding_line`: the formula below |
| 10 | Compute | `marks` | `hba1c_value = if(test_name == 'HbA1c', number(value), null)`, `spo2_value = number(spo2)`, both empty when they cannot be worked out |
| 11 | Aggregate | `by_patient` | **Group by** `mrn`; `findings` = list of `finding_line`, `finding_rows` = count, `max_hba1c` = max of `hba1c_value`, `min_spo2` = min of `spo2_value` |
| 12 | Join | `context` | **Reads** `only`; **Join with** `by_patient` **On** `mrn`; **Keep** left |
| 13 | AI prompt | `plan` | **Prompt** Care plan (DRAFT); **Fields** `risk`, `goals`, `interventions`, `follow_up`; **When a row fails** `fail` |
| 14 | Compute | `rule` | `risk_draft = risk`, then `risk` by the rule below |
| 15 | Select columns | `cp` | `mrn`, `name`, `reason`, `risk`, `risk_draft`, `max_hba1c`, `min_spo2`, `goals`, `interventions`, `follow_up` |
| 16 | Compute | `stage` | `stage = 'careplan'`, `readmission_risk = risk` |
| 17 | Save File | `keep` | **File name** `careplan-{{mrn}}.json`, **Format** json, **One file per row** on, **JSON columns** `goals`, `interventions` |
| 18 | Upload to bucket | `keep_bucket` | **Object key** `journey/careplans/{{mrn}}-run-{{run}}.json`, **Format** json, **One file per row** on |

```Compute: each finding as one line (step 9)
finding_line = concat(source_step, ': ', coalesce(test_name, ''), ' ', coalesce(text(value), ''), coalesce(finding, ''), if(is_null(spo2), '', concat(' SpO2 ', text(spo2))), if(is_null(hr), '', concat(' HR ', text(hr))))
```

```Compute: the risk by the rule, in code (step 14)
risk_draft = risk
risk       = if(max_hba1c >= 9 or min_spo2 < 90, 'High', if(max_hba1c >= 7.5 or min_spo2 < 94, 'Moderate', 'Low'))
```

> **Tip:** The rule, not the model, sets the risk the workflow branches on. The model's word stays in `risk_draft`, so a
> physician can see where they differ.

### The medication check

Make `Journey 10 · Medication safety check` with the run parameter `mrn`, **Sensitive**, a schedule **Only when
started**, and these steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 to 4 | Read S3, Remove duplicates, Compute, Filter | | As steps 1 to 4 of the care-plan pipeline |
| 5 | Compute | `own_meds` | `med_text = medications` |
| 6 | Split column | `one_per` | **Column** `med_text`, **Separator** `,`, **Into** rows, **Trim spaces** on, **Skip empty parts** on |
| 7 | Compute | `names` | `ingredient = regex_extract(med_text, '([a-zA-Z]+)')` |
| 8 | Read CSV/JSON/Parquet | `ref` | **File** `reference/interactions.csv` |
| 9 | Join | `pairs` | **Reads** `names`; **Join with** `ref` **On** `ingredient`; **Keep** left |
| 10 | Compute | `allergy` | `allergy_flag = if(regex_extract(allergies, '(penicillin)') == 'penicillin' and (ingredient == 'amoxicillin' or ingredient == 'penicillin'), true, false)`, `stage = 'medsafety'` |
| 11 | Filter | `flagged` | **Keep a row that meets** any: `severity` is one of `major`, `moderate`; `allergy_flag` equals `true` |
| 12 | Approval | `pharmacist` | **Task title** `Medication safety: {{rows}} flagged pairs`; **What to check** "Synthetic interaction pairs for demonstration only. Approve or reject."; **Reviewers** the Pharmacy team; **Decide within (hours)** 24 |
| 13 | Save File | `keep` | **File name** `med-safety.csv` |
| 14 | Upload to bucket | `keep_bucket` | **Object key** `journey/medsafety/{{mrn}}-run-{{run}}.csv`, **One file per row** on |

### The workflow's new steps

Open **Patient journey** in **Build › Approval workflows** and add, after **Nurse triage**:

1. **Run pipeline** `Care-plan draft (AI)`: **Schedule to run** Journey 9, `mrn` = `{{subject.mrn}}`, **Wait until the
   run ends**, **Keep how it ended as** `careplan`, **Keep values from its answer**, **The first row's fields**,
   **Fields** `risk`, **Give up after (hours)** 4.
2. **Approval** `Attending physician approves the care plan`: **Who approves** Dr. Anika Patel; **Due in (hours)** 4,
   **Remind before (hours)** 2; **When overdue, it goes to** the Physicians team; **A rejection needs a reason** on;
   **If rejected** *The request ends, rejected*.
3. **Condition** `High risk in the care plan?`: **Field of the request** `careplan.risk`, **Test** *is*, **Value**
   `High`; **If yes, go to** the senior approval, **If no, go to** the medication check.
4. **Approval** `Senior physician approves`: the team **Senior physicians**, **Due in (hours)** 8, a rejection needs a
   reason, rejected ends the request.
5. **Run pipeline** `Medication safety check`: Journey 10, `mrn` = `{{subject.mrn}}`, wait, **Keep how it ended as**
   `medsafety`, **Keep** **How many rows**, **Give up after (hours)** 24.
6. **Notify** `Tell the ward`: the team **Ward 4B nursing**, "The care plan and medication check for {{mrn}} are done."
7. **Publish version 2**, note `Care plan, senior rule, medication check`.

### The stand-in

Dr. Patel is away for the care-plan days, and Dr. Minh Nguyen decides for her. An out of office runs from a start to
an end, at most 90 days; she sets her own, or an administrator sets it for her ([Out of office](#adm-out-of-office)).

> **Note:** There is no console page for setting an out of office yet. Until there is, the task's **Pass on** in
> **Review › Approvals** hands one task to Dr. Nguyen: choose it, **Pass on**, pick him under **Pass it to**, and
> choose **Pass on**.

## Check it worked

1. A new request (or one already past triage, once you publish) runs **Care-plan draft (AI)**: the Journey 9 run has 18
   of 18 steps completed, one item, and an **AI answers** tab with one **Care plan (DRAFT)** call, its time and tokens.
2. Its `careplan-SV-000117.json` has `risk` **High** (HbA1c 9.4), goals, interventions and a follow-up. The model's
   own word is in `risk_draft`: in Summit Valley's run it said Low, and the rule set High.
3. Dr. Nguyen approves for Dr. Patel. The request's **History** reads "approved by Dr. Minh Nguyen (for Dr. Anika
   Patel)" when an out of office is set.
4. Because the risk is High, **Senior physician approves** appears for Dr. Chidi Okafor. Re-run with a patient whose
   HbA1c is below 7.5 and whose SpO2 stayed above 94, and this step is never asked.
5. The medication check holds **15 flagged pairs** at its Approval step, the first warfarin with ibuprofen (major).
   Avi Cohen approves; the run completes, and Ward 4B nursing is notified.

![The attending physician's approval step](rcp-j-wf-doctor "The workflow's step Attending physician approves the care plan: who approves, the due time, the reminder and where an overdue task goes")

## Common mistakes

- **The senior physician is never asked.** The condition must read `careplan.risk` and test it against `High` with a
  capital H, as the rule writes it.
- **"Held for review" instead of an answer.** The model's answer did not fit the schema. Keep the schema as short as
  above; on a local model a long list of allowed values slows every answer.
- **The care plan has no findings.** Steps 5 to 7 read the whole folders; check that recipe 3's runs wrote their files
  and that each file has an `mrn` column.
- **Dr. Patel approves her own request.** Nobody may approve a request they started; start the test request as
  someone else.
- **The medication check has no rows.** `medications` must be a comma-separated text, as in `cohort.json`; the split
  makes one row per medicine.

Next: [Patient journey 5: discharge](#rcp-journey-discharge).
