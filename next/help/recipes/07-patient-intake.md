---
id: rcp-patient-intake
title: "Patient intake: a form in sections, an AI draft, a nurse's approval and a signed summary"
summary: A new-patient intake form in twelve sections (or a scanned paper form), checked in code, summarised by AI as a DRAFT, approved by a nurse (and a senior nurse when the priority is high), kept as a signed Patient intake summary PDF and counted on a dashboard.
section: Healthcare
who: A workspace administrator builds it; the front desk (or the patient) fills the form; nurses approve
where: Get data in › Forms (/forms/builder); Get data in › Documents (/documents/types); Build › Pipelines (/pipelines/list); Build › Pipelines › Prompts (/pipelines/prompts); Build › Approval workflows (/workflows/designer); See results › Reports (/reports/templates); See results › Dashboards (/data/analytics/dashboards)
related: form-patient-intake, form-build, form-logic, form-starts, doc-types, doc-when-approved, ai-prompts, step-shape, apr-workflows, apr-who-decides, rs-approve, dash-build, qa-intake
---
Every new patient answers the same questions: who they are, who to call, their insurance, why they came, their history,
medicines and allergies, the symptoms they have now, and their consent. This recipe turns those answers into a one-page
picture a nurse can check in a minute: the answers are checked in code, a text model drafts a summary and a suggested
priority (a DRAFT), a nurse approves or rejects it, and the approved intake becomes a signed **Patient intake summary**
PDF with a QR code to verify it. Paper forms take the same road through Documents.

The names and values below are Riverside Health's own build. People who only fill the form or review intakes read
[Patient intake: from the front desk to a signed summary](#form-patient-intake) instead.

> **Note:** Not yet verified end to end. In Riverside Health the document type, the data contract, the prompt, the
> template (with a sample summary generated from it), the four pipelines, the form and the dashboard are built; when this
> was written the review workflow was not yet published and no intake had run through the whole road.

## What you'll build

| # | What | Name | Where |
|---|---|---|---|
| 1 | An access profile for the front desk | `Front desk` | Administration › Page access |
| 2 | A document type for scanned forms | `Patient intake · New patient intake form` | Documents › Document types |
| 3 | A data contract the answers are checked against | `patient_intake_rows` | Connections › Data contracts |
| 4 | The AI prompt | `Patient intake · clinician summary` | Pipelines › Prompts |
| 5 | The report template | `Patient intake summary` | Reports › Templates |
| 6 | Four pipelines, each with a schedule of the same name | `Patient intake · assess`, `Patient intake · summary report`, `Patient intake · from form`, `Patient intake · from documents` | Pipelines |
| 7 | The approval workflow | `Patient intake · intake review` | Approval workflows |
| 8 | The form, 50 fields in 12 sections | `New patient intake` | Forms |
| 9 | The dashboard | `Riverside — Patient intake` (use your own clinic's name) | Dashboards |

Two roads lead to the same summary:

- **A typed intake.** Front desk sends **New patient intake** → the workflow runs *from form* (which runs *assess*) →
  a nurse approves → for a high priority, a senior nurse approves too → *summary report* makes the PDF.
- **A scanned intake.** A PDF is uploaded in **Documents › Intake** → read and extracted as the intake type → approved in
  **Review › Documents** → *from documents* assesses each, a nurse approves the batch, *summary report* makes each PDF.

![The assess pipeline's steps](intake-rcp-assess "Patient intake · assess: read the intake, check it against the contract, three Compute steps, the AI prompt, the counts, keep the file and answer")

## What you need first

- A **storage connection** (Riverside: `riverside-health-s3`). Every file below is kept under the folder
  `patient-intake/` in it.
- A **model connection** with a text model (Riverside: *Local Ollama*, `qwen3:8b`). See [Models](#ai-models).
- A **team** of the nurses who review intakes (Riverside: *Reviewer*), and at least one workspace administrator who is
  the senior nurse. See [Teams](#adm-teams).
- A **brand profile** with your logo, the reviewing nurse's signature and your approval stamp, with **Digitally sign
  PDFs when approved** ticked. See [Branding](#rs-branding).
- The sample files (synthetic, fictional patients):
  - [intake-answers-sample.json](/help/samples/patient-intake/intake-answers-sample.json): Ingrid Castellanos, 78, on
    warfarin after a fall: an adult intake as the form keeps it (expected priority high).
  - [intake-child-sample.json](/help/samples/patient-intake/intake-child-sample.json): Theo Brannigan, 7, with his mother
    as guardian and a severe peanut allergy (expected priority medium).
  - [intake-pregnancy-sample.json](/help/samples/patient-intake/intake-pregnancy-sample.json): Noor Abernathy, about 24
    weeks pregnant with a headache and swollen ankles (expected priority high).
  - [intake-summary-sample.json](/help/samples/patient-intake/intake-summary-sample.json): one assessed intake, the test
    data for the template.
  - [intake-scanned-form-sample.pdf](/help/samples/patient-intake/intake-scanned-form-sample.pdf): a filled, three-page
    paper intake (Rosalind Achterberg) to upload in Documents.
  - [intake-test-cases.csv](/help/samples/patient-intake/intake-test-cases.csv): 25 test patients, how each arrives, and
    the priority and reason a good summary should give.

## Build it

> **Tip:** Two parts wait on each other. *Patient intake · from form* reads the form's dataset folder, and the form names
> the workflow that runs that pipeline. So save the form (part 8) as a draft before part 6, without its **Approval**, and
> choose the workflow in its **Settings** once part 7 is published.

### 1. The front desk's access
1. **Administration › Page access** → **New profile**: **Profile name** `Front desk`, **Description** "Fills in
   forms for patients and follows their requests. Nothing else."
2. Under **Pages this profile opens**, tick **Forms**, and **Task inbox** with only its **My requests** tab; nothing
   else. **Create profile** ([Page access profiles](#adm-access-profiles)).
3. Put the front-desk people on it. They see **Forms** and **My requests** only: no submissions, runs or reports.

### 2. The document type for paper forms
1. **Documents › Document types** → **New document type**: **Name** `Patient intake · New patient intake form`,
   **Key** `patient_intake_full`.
2. Give it a field for every single answer of the form below (the same keys), a **table** for each table answer
   (medicines, allergies, conditions, operations, family history, vaccines) and a table `ros_positives` **Symptoms ticked
   (review of systems)** with one column `symptom`, and a yes / no field `signed` for the signature.
3. Mark `first_name`, `last_name`, `dob` and `reason_for_visit` **Required**. **Auto-approve at** `97` %, and tick
   **Key** on `first_name`, `last_name` and `dob`: with no lookup of your patient list on them yet, every scan is checked by a
   person (see [Auto-approve needs key fields](#doc-types)). **What it is**: "A filled-in new-patient intake form" and its sections; **Words on
   the page**: `new patient intake, patient intake, intake form, review of systems, medicines you take now, allergies,
   consents and signature, emergency contact, insurance company`.
4. Add three rules ([Checks a document must pass](#doc-checks)): the visit is not dated before the date of birth
   ("The visit is dated before the patient was born."); the e-mail is in name@domain form; the phone has at least 7
   digits ("The phone number has fewer than 7 digits.").
5. **Save** and make it **Active**. Riverside's type reads 43 fields, 7 tables and 3 rules.

![The intake document type](intake-rcp-doc-type "The document type: its fields, tables and rules, Auto-approve at 97 %")

> **Tip:** Keep the starter type **Patient intake form** if you have it, but a page may then match either type: a reviewer
> picks the right one and chooses **Extract again** ([Reading documents](#doc-reading)).

### 3. The data contract
Make `patient_intake_rows` with **New from sample** ([Data contracts](#con-contracts)): **Direction** **In**, **Sensitivity**
sensitive, required
`first_name`, `last_name`, `dob`, `phone` and `reason_for_visit`, and these forms:

| Field | Must be |
|---|---|
| `first_name`, `last_name`, `reason_for_visit` | Text of at least one character |
| `dob` | `YYYY-MM-DD` |
| `phone`, `guardian_phone`, `emergency_phone` | 7 to 15 digits, with `+`, spaces, brackets, dots or dashes between |
| `email` | name@domain form, or empty |
| `pain_score`, `height_cm`, `weight_kg`, `tobacco_packs_per_day` | A number, a text or empty |
| Every other single answer | A text or empty |

### 4. The AI prompt
**Build › Pipelines › Prompts** → **New prompt** ([Write and test a prompt](#ai-prompts)): **Name** `Patient intake ·
clinician summary`, your text model, **Temperature** `0.1`, **Max tokens** `900`, the answer as a **JSON object**.

```System instructions: Patient intake · clinician summary
You prepare a new-patient intake for the nurse who reviews it. You never diagnose and never prescribe. Use ONLY the facts given: never add a medicine, allergy, condition or symptom the intake does not state. The patients are synthetic test data.
```

```Message template: Patient intake · clinician summary
Intake: {{patient_line}}.
Reason for the visit: {{reason_for_visit}} (for {{symptom_duration}}; pain {{pain_score}}/10). BMI: {{bmi}}.
Medicines (JSON): {{medications}}
Allergies (JSON): {{allergies}}
Conditions: {{conditions}}
Operations: {{surgeries}}
Family history: {{family_history}}
Social: {{social_line}}
Symptoms ticked now: {{ros_positives}}
Women's health: {{womens_health_line}}
Found by the rules: {{code_flags}}
Not given on the form: {{code_missing}}
Checks that failed: {{validation_line}}

Write: summary -- 4 to 6 plain sentences for the nurse (who, why now, the key history, medicines and allergies, what stands out). flags -- each drug allergy, high-risk medicine (anticoagulant, antiplatelet, insulin, opioid, methotrexate, digoxin, lithium), smoking, pregnancy or possible pregnancy, a child, and abnormal or worrying answers, as {type, detail}; type is one of drug allergy, high-risk medicine, smoking, pregnancy, child, abnormal answer, other. triage_priority -- high, medium or low, and triage_reasons -- why, in short phrases. missing_information -- what the nurse should ask about. medications_named and allergies_named -- every medicine and allergy your summary or flags name, as written in the intake.
```

The variables, all text: `patient_line` and `reason_for_visit` (required), `symptom_duration`, `pain_score`, `bmi`,
`medications`, `allergies`, `conditions`, `surgeries`, `family_history`, `social_line`, `ros_positives`,
`womens_health_line`, `code_flags`, `code_missing`, `validation_line`.

```Output schema: Patient intake · clinician summary
{"type": "object", "properties": {"summary": {"type": "string"}, "flags": {"type": "array", "items": {"type": "object", "properties": {"type": {"type": "string"}, "detail": {"type": "string"}}, "required": ["type", "detail"]}}, "triage_priority": {"type": "string", "enum": ["high", "medium", "low"]}, "triage_reasons": {"type": "array", "items": {"type": "string"}}, "missing_information": {"type": "array", "items": {"type": "string"}}, "medications_named": {"type": "array", "items": {"type": "string"}}, "allergies_named": {"type": "array", "items": {"type": "string"}}}, "required": ["summary", "flags", "triage_priority", "triage_reasons", "missing_information", "medications_named", "allergies_named"]}
```

**Try it** with the samples, then **Save & activate**.

> **Note:** Riverside's system instructions begin with `/no_think`, a switch its local model reads to answer without a
> long reasoning pass first. Leave it out unless your model takes it.

![The prompt](intake-rcp-prompt "Patient intake · clinician summary: the model, temperature 0.1, and the instructions that forbid adding anything the intake does not say")

### 5. The report template
Make the template **Patient intake summary** (category *Clinical documents*, Letter, portrait, compact, time zone
America/Chicago) in the designer ([Lay out a template](#rs-designer)), from top to bottom. Each part is a section kept
together, so no part is split across two pages.

| Part | What it shows |
|---|---|
| Header | Your logo; `Patient intake summary · {{primary.intake_id}}` and the report number |
| Title | `Patient intake summary · {{primary.patient_name}}`, and when and how the intake arrived |
| The patient | Date of birth, age, sex, language, **phone masked to its last 4 digits**, primary care and pharmacy; the parent or guardian when `is_minor` is true; the emergency contact (phone masked) |
| Reason for the visit | The reason, how long, pain, height, weight and BMI |
| Intake summary | A red, amber or green chip *Suggested triage priority: HIGH / MEDIUM / LOW*; the AI summary; the line "Drafted with AI from the patient's own answers (a DRAFT, not a diagnosis); reviewed by {{primary.reviewed_by}} on {{primary.reviewed_at}}."; *Why this priority* as a list |
| Flags | Allergies as red chips with their reactions; *High-risk medicines (found by the rules)* in red; *Also found by the rules*; the AI's flags as a table |
| Tables | Current medicines; allergies and reactions (a severe one in red); conditions, operations and family history; vaccines |
| Social history and symptoms | Tobacco, alcohol, drugs, occupation; the symptoms ticked (positives only) |
| Women's health | Pregnancy and last period, only when `sex` is `Female` |
| Insurance | Payer, **member IDs masked to their last 4**, group, policy holder, secondary insurance |
| Missing information to ask | The AI's list, what the rules found missing, and the checks that failed |
| Consents | The three consents, who signed and when |
| Nurse's review | Reviewed by, when, the nurse's note, the senior nurse (or *Not needed*); the signature with the stamp; a QR code *Scan to verify this report* |

Test it with `intake-summary-sample.json`, keep it as a test sample, and **Publish**.

![The template in the designer](intake-rcp-report "Patient intake summary in the designer with its test sample. The designer draws every Show only when part (all three priority chips, the guardian); the PDF prints only those that apply")

### 6. The pipelines
Make each as a pipeline with **Data sensitivity** *Sensitive* and keep its run data 30 days (720 hours), each with a
schedule of its own name that runs **Only when started**. Make them in this order: each Run pipeline step names the one
before.

**Patient intake · assess**, with one parameter `intake_key` (text, required, label "Intake (S-<submission> or
D-<document>)"):

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `intake` | **Bucket** your storage; **File** `patient-intake/incoming/{{param.intake_key}}.json`; **Format** json |
| 2 | Validate | `check` | **Contract name** `patient_intake_rows`; **Rows that do not hold** `flag` (every row goes on, with `_valid` and `_errors`) |
| 3 | Compute | `facts` | Age, BMI and the names (below) |
| 4 | Compute | `rules` | The flags in code (below) |
| 5 | Compute | `tidy` | Empty lists as nothing (below) |
| 6 | AI prompt | `draft` | **Prompt** Patient intake · clinician summary; **Variables** `reason_for_visit` = `{{reason_for_visit}}`; **Fields** `summary` as `ai_summary`, `flags` as `ai_flags`, `triage_priority` as `triage_priority`, `triage_reasons` as `ai_triage_reasons`, `missing_information` as `ai_missing_information`, `medications_named` as `ai_medications_named`, `allergies_named` as `ai_allergies_named`; **When a row fails** `fail`; **Calls at once** 1; **At most rows** 5 |
| 7 | Compute | `final` | The counts (below) |
| 8 | Upload to bucket | `keep` | **Object key** `patient-intake/assessed/{{param.intake_key}}.json`; **Format** json; **One file per row** on; **JSON columns** `medications`, `allergies`, `conditions`, `surgeries`, `family_history`, `immunizations`, `ros_positives`, `ai_flags`, `ai_triage_reasons`, `ai_missing_information`, `ai_medications_named`, `ai_allergies_named`, `priority_rows`, `ros_list` |
| 9 | Select columns | `answer` | `intake_id`, `source`, `patient_name`, `age`, `triage_priority`, `flag_count`, `high_risk_meds`, `code_flags`, `missing_count`, `code_missing`, `validation_line`, `valid`, `ai_summary` |

Tick **Empty when it cannot be worked out** on every formula except `patient_name`, `age_text` and `patient_line` (and,
in `final`, `priority_rows` and `ros_list`).

```Compute "facts": age, BMI and the names
age          = floor(days_between(dob, coalesce(visit_date, today())) / 365.25)
bmi          = if(number(height_cm) > 0 and number(weight_kg) > 0, round(number(weight_kg) / ((number(height_cm) / 100) * (number(height_cm) / 100)), 1), null)
patient_name = concat(first_name, ' ', last_name)
age_text     = if(is_null(age), 'unknown', concat(text(age), ' years'))
minor        = if(age < 18, 1, 0)
dob_ok       = if(is_null(age), 0, if(age >= 0 and age <= 120, 1, 0))
```

```Compute "rules": the flags in code
anticoag       = regex_extract(coalesce(medications, ''), '(?i)(warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|heparin|enoxaparin|clopidogrel|ticagrelor|prasugrel)')
insulin        = regex_extract(coalesce(medications, ''), '(?i)(insulin|glargine|lispro|aspart|detemir|degludec)')
other_hr       = regex_extract(coalesce(medications, ''), '(?i)(methotrexate|digoxin|lithium|oxycodone|hydrocodone|morphine|tramadol|fentanyl|codeine)')
med_count      = coalesce(json_array_length(medications), 0)
drug_allergy   = if(is_null(regex_extract(coalesce(allergies, ''), '(?i)"allergy_type"\s*:\s*"drug"')), 0, 1)
severe_allergy = if(is_null(regex_extract(coalesce(allergies, ''), '(?i)(severe|anaphyla|angioedema)')), 0, 1)
smoker         = if(tobacco == 'Current', 1, 0)
pregnant       = if(pregnancy_status == 'Pregnant' or pregnancy_status == 'Possibly pregnant', 1, 0)
red_flag       = regex_extract(coalesce(text(ros_positives), ''), '(Chest pain|Shortness of breath|Dizziness or fainting|Falls in the last year)')
high_risk_meds = concat(coalesce(anticoag, ''), if(is_null(anticoag) or is_null(insulin), '', ', '), coalesce(insulin, ''), if(is_null(other_hr) or (is_null(anticoag) and is_null(insulin)), '', ', '), coalesce(other_hr, ''))
code_flags     = concat(if(drug_allergy == 1, 'drug allergy; ', ''), if(severe_allergy == 1, 'severe allergy; ', ''), if(med_count >= 5, concat('polypharmacy (', text(med_count), ' medicines); '), ''), if(smoker == 1, 'smoker; ', ''), if(pregnant == 1, concat(pregnancy_status, '; '), ''), if(minor == 1, 'a child (guardian on file); ', ''), if(is_null(red_flag), '', concat('symptom: ', red_flag, '; ')))
code_missing   = concat(if(is_null(insurance_payer), 'insurance; ', ''), if(is_null(emergency_name), 'emergency contact; ', ''), if(is_null(height_cm) or is_null(weight_kg), 'height and weight; ', ''), if(is_null(primary_care_physician), 'primary care physician; ', ''), if(is_null(preferred_pharmacy), 'pharmacy; ', ''), if(minor == 1 and is_null(guardian_name), 'guardian; ', ''), if(med_count > 0 and is_null(regex_extract(coalesce(medications, ''), '"dose"')), 'medicine doses; ', ''))
validation_line = concat(if(_valid == false, concat('the contract: ', text(_errors), '; '), ''), if(dob_ok == 0, 'date of birth is not a real age; ', ''))
patient_line   = concat(patient_name, ', ', age_text, ', ', coalesce(sex, 'sex not given'), if(minor == 1, concat(', with guardian ', coalesce(guardian_name, 'not named')), ''))
social_line    = concat('Tobacco: ', coalesce(tobacco, 'not given'), if(is_null(tobacco_packs_per_day), '', concat(' (', text(tobacco_packs_per_day), ' packs a day)')), '; alcohol: ', coalesce(alcohol, 'not given'), '; recreational drugs: ', coalesce(recreational_drugs, 'not given'), '; occupation: ', coalesce(occupation, 'not given'))
womens_health_line = if(sex == 'Female', concat(coalesce(pregnancy_status, 'pregnancy not stated'), ', last period ', coalesce(lmp_date, 'not given')), 'not applicable')
tobacco_text   = concat(coalesce(tobacco, 'Not given'), if(is_null(tobacco_packs_per_day), '', concat(', ', text(tobacco_packs_per_day), ' packs a day')))
```

```Compute "tidy": the same formula on four columns
high_risk_meds  = regex_extract(high_risk_meds, '^(.*?\S)[;,\s]*$')
code_flags      = regex_extract(code_flags, '^(.*?\S)[;,\s]*$')
code_missing    = regex_extract(code_missing, '^(.*?\S)[;,\s]*$')
validation_line = regex_extract(validation_line, '^(.*?\S)[;,\s]*$')
```

```Compute "final": the counts and the report's lists
flag_count    = coalesce(json_array_length(ai_flags), 0)
missing_count = coalesce(json_array_length(ai_missing_information), 0)
priority_rows = concat('[{"priority":"', coalesce(triage_priority, 'unknown'), '"}]')
ros_list      = coalesce(ros_positives, '[]')
assessed_on   = '{{run.date}}'
valid         = if(_valid == false or dob_ok == 0, 0, 1)
```

> **Note:** The high-risk medicines, drug and severe allergies, smoking, pregnancy, a child and the worrying symptoms are
> found by these formulas, not by the model: the same answers always give the same flags. The model's flags come beside
> them, as a DRAFT.

**Patient intake · summary report**, with the parameters `intake_key` (required), and `reviewed_by`, `reviewed_at`,
`review_note`, `senior_by`, `senior_note` (each text, default empty):

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `assessed` | **File** `patient-intake/assessed/{{param.intake_key}}.json`; **Format** json |
| 2 | Compute | `reviewed` | `reviewed_by` = `'{{param.reviewed_by}}'`, `reviewed_at` = `'{{param.reviewed_at}}'`, `review_note` and `senior_line` from the notes, `report_day` = `'{{run.date}}'` |
| 3 | Generate report | `report` | **Use a saved template** Patient intake summary, **The latest published version**; one report per row (at most 5); your brand profile; **Formats** PDF and HTML; **Report name** `Patient intake · {{intake_id}}`; the list columns as JSON columns |
| 4 | Save File | `json` | **File name** `intake-{{intake_id}}.json`, json, one file per row: the intake as JSON, kept with the run |
| 5 | Select columns | `outcome` | The outcome row: `intake_id`, `source`, `received_at`, `visit_date`, `age`, `sex`, `triage_priority`, `flag_count`, `missing_count`, `valid`, `drug_allergy`, `severe_allergy`, `anticoag`, `insulin`, `other_hr`, `smoker`, `pregnant`, `minor`, `red_flag`, `med_count`, `reviewed_by`, `reviewed_at`, `senior_line`, `report_day` |
| 6 | Upload to bucket | `keep_outcome` | **Object key** `patient-intake/outcomes/{{param.intake_key}}.csv`; **Format** csv: the dashboard reads every one |

> **Tip:** `'{{param.reviewed_by}}'` puts a person's name inside quotes in a formula. A name with a quote in it, such as
> O'Brien, stays one text: see [Compute](#step-shape--compute).

**Patient intake · from form**, with one parameter `submission_id` (text, required):

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `submission` | **File**: the form's dataset folder (its **Settings** › **Dataset**) and `submission-{{param.submission_id}}.json`; json |
| 2 | Compute | `shape` | `intake_id` = `concat('S-', text(submission_id))`, `source` = `'front desk form'`, `received_at` = `submitted_at` |
| 3 | Upload to bucket | `incoming` | `patient-intake/incoming/{{intake_id}}.json`, json, one file per row, the table answers and `ros_positives` as JSON columns |
| 4 | Run pipeline | `assess` | **Pipeline** Patient intake · assess; **Call** `once`; **Parameters** `intake_key` = `{{intake_id}}` |

**Patient intake · from documents** (no parameters), started by approved intake documents:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read documents | `docs` | The approved documents that started the run |
| 2 | Compute | `shape` | `intake_id` = `concat('D-', text(extraction_id))`, `source` = `'scanned form (Documents)'`, `received_at` = `date_approved` |
| 3 | Upload to bucket | `incoming` | As in *from form* |
| 4 | Run pipeline | `assess` | Patient intake · assess, **Call** `each`, `intake_key` = `{{intake_id}}`, **Column prefix** `assess_`, **Fields** `triage_priority`, `flag_count`, `high_risk_meds`, `code_flags`, `missing_count`; at most 10 calls |
| 5 | Approval | `nurse` | **Task title** `Patient intake: {{rows}} scanned intake(s) to review, the first {{intake_id}} ({{triage_priority}} priority)`; **Fields** First intake, Priority, Flags, High-risk medicines; **Reviewers are** `team`, your nurses' team; **Decide within (hours)** 72 |
| 6 | Run pipeline | `report` | Patient intake · summary report, **Call** `each`, `intake_key` = `{{intake_id}}`, `reviewed_by` = "the reviewing nurse (Task inbox approval)", `reviewed_at` = `{{run.date}}` |

On its schedule, under **Also starts when**, turn on **A document is approved**, pick the type `Patient intake · New
patient intake form`, and set **Documents per run** to `5` ([Start a pipeline on approval](#doc-when-approved)).

![The from documents pipeline](intake-rcp-from-documents "Patient intake · from documents: read the approved documents, assess each, one nurse's approval for the batch, then a signed summary for each")

### 7. The approval workflow
**Build › Approval workflows** → **New workflow**: **Name** `Patient intake · intake review`, **Key** `patient-intake`,
**What it approves** `form_submission`. Then the steps ([Design an approval workflow](#apr-workflows)):

| # | Step | Name | Settings |
|---|---|---|---|
| 1 | Run pipeline | Assess the intake: checks, rules and the AI summary | **Schedule to run** Patient intake · from form; **Parameters** `submission_id` = `{{submission_id}}`; **Wait until the run ends, its approvals included** on; **Keep how it ended as** `assessment`; **Keep values from its answer** (its final output, the first row) `intake_id`, `patient_name`, `age`, `triage_priority`, `flag_count`, `high_risk_meds`, `code_flags`, `missing_count`, `code_missing`, `validation_line`, `ai_summary`; **Give up after (hours)** 2 |
| 2 | Condition | Assessed? | `assessment.ok` **is** `true`: yes → step 3; no → step 9 |
| 3 | Approval | A nurse reviews the intake summary and flags | **Everyone in a team**: your nurses; **Due in (hours)** 4; **Remind before (hours)** 2; **A rejection needs a reason**; **If rejected** the request ends, rejected; **Keep the decision as** `nurse` |
| 4 | Condition | High priority? | `assessment.triage_priority` **is** `high`: yes → step 5; no → step 7 |
| 5 | Approval | A senior nurse decides the high-priority intake | **Everyone with a role**: **Administrators**; **Due in (hours)** 2; a rejection needs a reason and ends the request; **Keep the decision as** `senior` |
| 6 | Run pipeline | The signed Patient intake summary (with the senior nurse) | Patient intake · summary report; `intake_key` = `{{assessment.intake_id}}`, `reviewed_by` = `{{nurse.byName}}`, `reviewed_at` = `{{nurse.at}}`, `review_note` = `{{nurse.comment}}`, `senior_by` = `{{senior.byName}}`, `senior_note` = `{{senior.comment}}`; wait, keep as `summary_report`; **Then** step 8 |
| 7 | Run pipeline | The signed Patient intake summary | The same without the senior's two parameters |
| 8 | Save to dataset | Intake reviews | **Dataset** `patient-intake-reviews`; **Then** End the request |
| 9 | Task | The assessment failed: look at its run | **Everyone with a role**: **Administrators**; **Then** End the request; **If the request ends here, it ends as** Failed |

**Publish version 1**.

> **Warning:** A nurse's rejection ends the request before step 6 or 7: no summary is made, and the request reads
> rejected with the nurse's reason.

### 8. The form
**Get data in › Forms** → **New form**: **Name** `New patient intake`; **Description** "New-patient intake, for patients
and the front desk: about the patient, insurance, this visit, history, medicines and allergies, symptoms, consents and
signature. A nurse reviews every intake." Add the 50 fields below in this order ([Build a form](#form-build)),
giving each its **Section**; the fields of one section must sit together. Then the rules, on the **Logic** tab
([Show or require a field when](#form-logic)):

- the three guardian fields: **Show only when** and **Also required when** **Is the patient under 18?** is **Yes**;
- **Packs a day**: **Show only when** **Tobacco or nicotine** is **Current**;
- **Pregnancy** and **First day of the last period**: **Show only when** **Sex** is **Female**.

| Section | Label | Key | Type | Required | Placeholder, options or columns |
|---|---|---|---|---|---|
| **Patient** | First name | `first_name` | Text | Yes | `e.g. Jordan` |
|  | Last name | `last_name` | Text | Yes | `e.g. Rivera` |
|  | Date of birth | `dob` | Date | Yes | `e.g. 1980-04-12`; help: “Year, month, day.” |
|  | Sex | `sex` | Choice | Yes | `Choose one`; options `Female`, `Male`, `Intersex`, `Prefer not to say` |
|  | Preferred language | `preferred_language` | Choice |  | `Choose one`; options `English`, `Spanish`, `Polish`, `Vietnamese`, `Arabic`, `Other` |
|  | Mobile phone | `phone` | Text | Yes | `e.g. +1 555 0100`; help: “We text appointment reminders to this number.” |
|  | E-mail | `email` | E-mail |  | `name@example.com` |
|  | Home address | `address` | Long text |  | `Street, city, state, ZIP` |
| **Parent or guardian (patients under 18)** | Is the patient under 18? | `is_minor` | Yes / no | Yes |  |
|  | Parent or guardian's name | `guardian_name` | Text | When under 18 | `e.g. Alex Rivera`; shown when under 18 |
|  | Relationship to the patient | `guardian_relationship` | Choice | When under 18 | `Choose one`; options `Mother`, `Father`, `Legal guardian`, `Other`; shown when under 18 |
|  | Parent or guardian's phone | `guardian_phone` | Text | When under 18 | `e.g. +1 555 0100`; shown when under 18 |
| **Emergency contact** | Emergency contact name | `emergency_name` | Text |  | `e.g. Sam Rivera` |
|  | Relationship | `emergency_relationship` | Text |  | `e.g. Spouse` |
|  | Emergency contact phone | `emergency_phone` | Text |  | `e.g. +1 555 0100` |
| **Insurance** | Insurance company | `insurance_payer` | Text |  | `e.g. Prairie Mutual Health`; help: “Leave empty if you pay for the visit yourself.” |
|  | Member ID | `insurance_member_id` | Text |  | `As on the card, e.g. PMH-448812` |
|  | Group number | `insurance_group` | Text |  | `e.g. GRP-2041` |
|  | Policy holder's name | `subscriber_name` | Text |  | `e.g. Jordan Rivera`; help: “The person the insurance is in the name of.” |
|  | Patient's relationship to the policy holder | `subscriber_relationship` | Choice |  | `Choose one`; options `Self`, `Spouse`, `Child`, `Other` |
|  | Secondary insurance (if any) | `secondary_payer` | Text |  | `e.g. Medicare (synthetic)` |
|  | Secondary member ID | `secondary_member_id` | Text |  | `e.g. 1EG4-TE5-MK72` |
| **This visit** | Date of the visit | `visit_date` | Date | Yes | `e.g. 2026-10-26` |
|  | Main reason for the visit | `reason_for_visit` | Long text | Yes | `e.g. Cough and fever for three days`; help: “In the patient's own words.” |
|  | How long has this been going on? | `symptom_duration` | Text |  | `e.g. 3 days` |
|  | Pain right now (0 = none, 10 = worst) | `pain_score` | Number |  | `0-10` |
|  | Height (cm) | `height_cm` | Number |  | `e.g. 170` |
|  | Weight (kg) | `weight_kg` | Number |  | `e.g. 72.5` |
| **Medical history** | Ongoing or past conditions | `conditions` | Table |  | Condition (required); Since (year); Status, a choice of Active / Controlled / Resolved; at most 20 rows; help: “One row per condition.” |
|  | Operations and hospital stays | `surgeries` | Table |  | Operation or reason (required); Year, a number; at most 15 rows |
|  | Family history | `family_history` | Table |  | Relative (required), a choice of Mother / Father / Sibling / Grandparent / Child / Other; Condition (required); at most 15 rows; help: “Conditions in blood relatives.” |
| **Social history** | Tobacco or nicotine | `tobacco` | Choice |  | `Choose one`; options `Never`, `Former`, `Current` |
|  | Packs a day | `tobacco_packs_per_day` | Number |  | `e.g. 0.5`; shown when Current |
|  | Alcohol | `alcohol` | Choice |  | `Choose one`; options `None`, `Occasional`, `Weekly`, `Daily` |
|  | Recreational drugs | `recreational_drugs` | Choice |  | `Choose one`; options `No`, `In the past`, `Current` |
|  | Occupation | `occupation` | Text |  | `e.g. Teacher` |
| **Medicines, allergies and vaccines** | Medicines you take now | `medications` | Table |  | Medicine (required); Dose; How often; How taken, a choice of By mouth / Inhaled / Injection / On the skin / Other; at most 30 rows; help: “Include inhalers, injections, vitamins and over-the-counter medicines.” |
|  | Allergies | `allergies` | Table |  | Allergic to (required); Type, a choice of Drug / Food / Environmental / Latex / Other; What happens; Severity, a choice of Mild / Moderate / Severe; at most 20 rows; help: “Medicines, foods, latex or anything else, and what happens.” |
|  | Vaccines | `immunizations` | Table |  | Vaccine (required); Date (about), a date; at most 20 rows; help: “The ones you remember.” |
| **Review of systems** | Do you have any of these now? | `ros_positives` | Checkboxes (tick all that apply) |  | The 25 options below, one per line; help: “Tick all that apply.” |
| **Women's health** | Pregnancy | `pregnancy_status` | Choice |  | `Choose one`; options `Not pregnant`, `Pregnant`, `Possibly pregnant`, `Not applicable`; shown when Female |
|  | First day of the last period | `lmp_date` | Date |  | `e.g. 2026-10-01`; shown when Female |
| **Care team** | Primary care physician | `primary_care_physician` | Text |  | `e.g. Dr. Lee, Millbrook Family Practice` |
|  | Preferred pharmacy | `preferred_pharmacy` | Text |  | `e.g. Millbrook Pharmacy, Main St` |
| **Consents and signature** | I agree to be examined and treated. | `consent_treatment` | Yes / no | Yes |  |
|  | I have received the notice of privacy practices. | `consent_privacy` | Yes / no | Yes |  |
|  | I accept responsibility for charges my insurance does not pay. | `consent_financial` | Yes / no | Yes |  |
|  | Signature of the patient or guardian | `signature` | Signature | Yes |  |
|  | Name of the person signing | `signed_by` | Text | Yes | `e.g. Jordan Rivera` |
|  | Date signed | `signed_date` | Date | Yes | `e.g. 2026-10-26` |

```Options: Do you have any of these now? (one per line in the builder)
Fever or chills
Unplanned weight loss
Fatigue
Vision changes
Sore throat
Chest pain
Palpitations
Leg or ankle swelling
Shortness of breath
Cough
Wheezing
Abdominal pain
Nausea or vomiting
Diarrhea
Painful urination
Joint pain
Back pain
Rash
Headache
Dizziness or fainting
Numbness or tingling
Low mood
Anxiety
Sleep problems
Falls in the last year
```

In **Settings**, under **Approval**, pick **Patient intake · intake review**; leave **When submitted, start** at
**Nothing: keep the submission** (the workflow runs the pipeline). Set **Status** **Active**, **Save** and **Publish**.

> **Tip:** The form is at the 50-field limit. To add a question, combine two (an address in one long text, say) rather
> than splitting a table into fields.

### 9. The dashboard
In **Analytics Studio**, open `patient-intake/outcomes/*.csv` (every outcome row) as one dataset and save these, then
make the board **Riverside — Patient intake** with a widget for each ([Build and edit a dashboard](#dash-build)):

| Widget | Drawn as | What it counts |
|---|---|---|
| Intakes reviewed | KPI | Every outcome row |
| Average time to review (minutes) | KPI | From `received_at` to `reviewed_at` |
| High priority (%) | Gauge | Share with `triage_priority` high |
| Missing-information rate (%) | Gauge | Share with `missing_count` above 0 |
| Intakes per day (visit date) | Bars | Rows per `visit_date` |
| Triage priority mix (AI DRAFT) | Donut | By `triage_priority` |
| Flags by type (found by the rules) | Horizontal bars | Drug allergy, severe allergy, anticoagulant / antiplatelet, insulin, other high-risk medicine, smoker, pregnancy, child, worrying symptom |
| Flags drafted per intake (AI) | Bars | Rows per `flag_count` |
| Where the intakes came from | Donut | By `source` (front desk form, scanned form) |
| Each reviewed intake | Table | `intake_id`, `source`, `visit_date`, `age`, `sex`, `triage_priority`, `flag_count`, `missing_count`, `valid`, `reviewed_by`, `reviewed_at`, newest first |

```Query: Average time to review (minutes)
SELECT 'Minutes' AS metric, round(avg(date_diff('minute', CAST(received_at AS TIMESTAMPTZ), CAST(reviewed_at AS TIMESTAMPTZ))), 1) AS value FROM dataset WHERE try_cast(reviewed_at AS TIMESTAMPTZ) IS NOT NULL
```

```Query: High priority (%)
SELECT round(avg(CASE WHEN triage_priority = 'high' THEN 100.0 ELSE 0 END), 1) AS high_pct FROM dataset
```

## Check it worked
1. As the front desk, fill **New patient intake** with `intake-answers-sample.json` (Ingrid Castellanos) and **Submit**.
   **Review › My requests** lists the request **Patient intake · intake review**, at its first step.
2. When the assessment has run, a nurse of your team finds the approval in **Review › Approvals**, with the
   intake's priority, flags and DRAFT summary. Ingrid's should read **high**, with warfarin as a high-risk medicine and
   *polypharmacy (9 medicines)* found by the rules.
3. The nurse approves with a note. Because the priority is high, an administrator gets the senior nurse's approval.
4. After both, **Reports › Library** has **Patient intake · S-<number>**. Approved with **Approve and sign**, it reads
   **Signed**; **Verify signature** says it holds. The PDF shows the phone and member ID masked to their last 4 digits,
   the reviewing nurse's name and time under the summary, and the QR code.
5. Fill the child sample: the guardian section appears when **Is the patient under 18?** is **Yes** and its fields are
   required; **Women's health** stays hidden for a male patient.
6. Reject one intake with a reason: the request ends rejected, and no report is made for it.
7. Upload `intake-scanned-form-sample.pdf` in **Documents › Intake**. It is read as **Patient intake · New patient intake
   form** and waits in **Review › Documents**; approve it, and the *from documents* run asks a nurse to approve, then makes
   its summary.
8. **Riverside — Patient intake** counts each reviewed intake; **Where the intakes came from** shows the form and the
   scan.


## Common mistakes
- **The guardian's fields are never asked.** Their rule tests **Is the patient under 18?** for **Yes**; a rule on the
  date of birth does not work, because a form's rules test answers, not ages.
- **A section shows twice.** Fields of one section must be next to each other. A field with another section (or none)
  between them starts the section again under a second heading.
- **The nurse's name is empty on the PDF.** The approval needs **Keep the decision as** `nurse`, and the report's
  parameters must say `{{nurse.byName}}` exactly; a kept name can be used only by the steps after the approval.
- **The flags are missing a ticked symptom.** A **Checkboxes** answer is a list; the formula reads it as text with
  `text(ros_positives)`, and a rule on it says **is** `Chest pain` for "Chest pain is ticked".
- **Every intake fails the contract on the phone.** The contract wants 7 to 15 digits. `555-01` fails on purpose: the
  intake still goes on, flagged, and the summary lists it under *Checks that failed*.
- **A scan is read as the starter type.** With two intake types in the workspace, choose the right type and **Extract
  again**.

> **Warning:** The summary, the flags the model drafts and the suggested priority are a DRAFT for the nurse, never a
> diagnosis or a triage decision. The nurse reads them against the patient's own answers before approving.
