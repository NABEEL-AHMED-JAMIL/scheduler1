---
id: rcp-journey-registration
title: "Patient journey 2: the Patient journey workflow and registration"
summary: Build the approval workflow that carries the stay, and its first step, a registration pipeline that checks cover with one API collection and fetches the record from another.
section: The patient journey
who: A workspace administrator
where: Build › Approval workflows (/workflows/designer); Get data in › Connections › API collections (/connections/api-collections); Administration & billing › Developers › API Clients (/developers/api-clients)
related: rcp-journey-referral, rcp-journey-ward, tour-journey-starts, tour-registration, apr-workflows, trg-workflow, con-api-collections, step-check
---
The journey is one approval workflow, **Patient journey**, that runs a pipeline at each stage, asks the right people,
and decides the way from what the pipelines answer. This recipe makes the workflow with its first four steps and the
registration pipeline its first step runs. Later recipes add their steps to the same workflow and publish it again.

## What you'll build

- An event route: the event `admission.accepted`, which recipe 1's pipeline sends, opens a **Patient journey** request
  with the patient's MRN, name, age, reason and urgency.
- The workflow's first steps: **Registration** (run the pipeline and wait), **Registered?** (a condition on its answer),
  **Self-pay counselling** (a task for Revenue cycle, only when the patient is not covered) and **Nurse triage** (a task
  for Ward 4B nursing).
- The pipeline **Journey 4 · Registration: eligibility then patient record**: it asks a payer whether the cover is
  active (an echo service stands in for the payer, so a roster file decides), and fetches the patient's demographics
  from a public FHIR test server. It writes one patient record to `journey/patients/`, which every later stage reads.

![The workflow's first condition](rcp-j-wf-registered "Build › Approval workflows: the Patient journey, its condition Registered? selected")

## What you need first

- Recipe 1 done: referrals land in `journey/referrals/` and the admission event is sent.
- An **API client** with the `events:write` scope, used by recipe 1's Call API step ([API clients](#dev-clients)).
- Two files in your bucket, uploaded with **See results › Analysis › Files** (**Upload**):

| File | Put it at | What it holds |
|---|---|---|
| [cohort.json](/help/samples/patient-journey/cohort.json) | `journey/seed/cohort.json` | The ten fictional patients: payer plan, FHIR test id, allergies and medicines |
| [roster.csv](/help/samples/patient-journey/roster.csv) | `payers/roster.csv` | The payer roster: 40 members, each `active` or `inactive` |

## Build it

### Two API collections

Open **Get data in › Connections › API collections** (see [Make an API collection](#con-api-collections)) and make:

| Collection | Environment variable | Request | Method and address | Body |
|---|---|---|---|---|
| Payer and partner sandboxes | `echoBase` = `https://postman-echo.com` | Payer: eligibility | POST `{{echoBase}}/post` | JSON: `{{payload}}` |
| Public health APIs | `fhirBase` = `https://r4.smarthealthit.org` | FHIR: one patient | GET `{{fhirBase}}/Patient/{{fhir_id}}` | none |

Neither needs a sign-in. Try each with **Test** before you go on ([Test a request](#con-api-test)).

> **Note:** The echo service sends back whatever it is sent; it stands in for a payer's eligibility service. The
> decision comes from your roster, joined in the pipeline, never from the echo.

### The registration pipeline

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name**
   `Journey 4 · Registration: eligibility then patient record`, **Create and add steps**.
2. On **Settings**, under **Run parameters**, choose **Add a parameter**: **Name** `mrn`, **Type** **Text**, **Label**
   `MRN (empty: every patient waiting)`, **Default** empty. Set **Data sensitivity** to **Sensitive**.
3. Add the 14 steps of the table below on **Steps**, then **Save**.
4. Make its schedule: **Schedule**, **Only when started**, **Create schedule**. The workflow runs it.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `new` | Your bucket, **Prefix** `journey/referrals/{{param.mrn}}`, **Read as** json, **At most objects** 50 |
| 2 | Compute | `only_flag` | `wanted = if('{{param.mrn}}' == '' or mrn == '{{param.mrn}}', 1, 0)` |
| 3 | Filter | `only` | `wanted` equals `1` |
| 4 | Read CSV/JSON/Parquet | `seed` | Your bucket, **File** `journey/seed/cohort.json`, **Format** json |
| 5 | Select columns | `seed_cols` | `mrn`, `plan_code`, `fhir_id`, `allergies`, `medications`, and `member_id` as `seed_member_id` |
| 6 | Join | `patient` | **Reads** `only`; **Join with** `seed_cols` **On** `mrn` = `mrn`; **Keep** left |
| 7 | Compute | `ids` | `member_id = coalesce(member_id, seed_member_id)` |
| 8 | Read CSV/JSON/Parquet | `roster` | Your bucket, **File** `payers/roster.csv`, **Format** csv |
| 9 | Call API | `eligibility` | **Reads** `ids`; request **Payer: eligibility**; **Send** each; **Columns sent** `mrn` as `patient.mrn`, `member_id` as `member.id`, `plan_code` as `plan.code`; **Variables** `payload` = `{{row}}`; **Fields** `json.member.id` as `echo_member_id`; **Ok only when** `json.member.id` is not empty; **When a call is not ok** continue; **Column prefix** `elig_` |
| 10 | Join | `payer` | **Reads** `eligibility`; **Join with** `roster` **On** `member_id` = `member_id`; **Keep** left; **Prefix for clashing columns** `payer_` |
| 11 | Compute | `eligible` | `eligible = if(coalesce(payer_status, status) == 'active', true, false)` and `stage = 'registration'` |
| 12 | Enrich | `fhir` | Request **FHIR: one patient**; **Variables** `fhir_id` = `{{fhir_id}}`; **Fields** `name[0].family` as `fhir_family`, `birthDate` as `fhir_birth_date`, `address[0].city` as `fhir_city`; **When a call fails** null |
| 13 | Upload to bucket | `record` | **Object key** `journey/patients/{{mrn}}-run-{{run}}.json`, **Format** json, **One file per row** on |
| 14 | Save File | `result` | **File name** `registration.csv`, **Format** csv |

> **Tip:** Steps 2 and 3 let the same pipeline run for one patient (the workflow passes the MRN) or, with the MRN
> empty, for everyone waiting. Recipes 4 and 5 use the same pair.

### The workflow

1. Open **Build › Approval workflows** and choose **New workflow**. **Name** `Patient journey`, **Key**
   `patient-journey` (it cannot change later), **What it approves** `admission`, **Description** "One admission from
   registration to the signed discharge packet." Choose **Create and design**.
2. **Add a step**, **Run pipeline**. Name it `Registration: eligibility, then the patient record`. **Schedule to run**:
   the registration schedule. **Parameters**: `mrn` = `{{subject.mrn}}`. Tick **Wait until the run ends, its approvals
   included**; **Keep how it ended as** `registration`; tick **Keep values from its answer**, **From** **Its final
   output**, **Keep** **The first row's fields**, **Fields** `eligible`. **Give up after (hours)** `2`.
3. **Add after**, **Condition**, named `Registered?`. **Field of the request** `registration.eligible`, **Test** *is*,
   **Value** `true`. **If yes, go to** the nurse triage task (step 5); **If no, go to** the self-pay task (step 4).
4. **Add after**, **Task**, named `Self-pay counselling`. **Who does it**: the team **Revenue cycle**; **Due in
   (hours)** `24`; then it goes on to the nurse triage task.
5. **Add after**, **Task**, named `Nurse triage (fill the Nurse triage form)`. **Who does it**: the team **Ward 4B
   nursing**; **Due in (hours)** `4`.
6. Choose **Publish version 1**, with the note `First steps: registration and triage`.

### The event route

1. Open **Administration & billing › Developers › API Clients**, scroll to **Event routes** and choose **New event
   route**.
2. **Event type** `admission.accepted`; **Starts** **A workflow request**; **Workflow key** `patient-journey`. Choose
   **Add route**.

### Another way in: a form

Without the event (recipe 1's tip), make a form **Admission intake** with at least `mrn`, `name`, `dob`, `reason` and
`urgency` ([Build a form](#form-build)). In its **Settings**, set **Approval** to **Patient journey**, and under **When
submitted, start** a small pipeline that keeps the submission as `journey/referrals/{{mrn}}.json`, so registration reads
it like a referral ([What a submission starts](#form-starts)).

## Check it worked

1. Approve another referral (recipe 1), or send the form. **Review › Approvals**, tab **My requests**, shows a
   **Patient journey** request for Elena Marsh: "Event admission.accepted".
2. Its **History** says the registration run started, with a link. The run has 14 of 14 steps completed and one item,
   Elena's, **Done**; it takes about a minute and a half.
3. The run's **Outputs** has `registration.csv` with `eligible` **true**; the bucket has
   `journey/patients/SV-000117-run-<run>.json` with her FHIR family name and city.
4. The request goes past **Registered?** on the "yes" branch: **Self-pay counselling** is skipped, and the **Nurse
   triage** task waits for Ward 4B nursing, due in four hours.
5. To see the other branch, set Elena's member `SVH-100200` to `inactive` in `roster.csv`, upload it again, and run
   the registration by hand with **Run with…** and `mrn` = `SV-000117`: `eligible` is now **false**, and in a request
   she would go to **Self-pay counselling**. Set it back to `active` afterwards.

![The registration pipeline's steps](rcp-j-registration-steps "Journey 4's steps: the referral, the cohort record, the payer call, the roster, and the FHIR record")

## Common mistakes

- **The condition always goes "no".** **Keep values from its answer** must keep the field `eligible`, and the condition
  must read `registration.eligible`: the name you gave **Keep how it ended as**, a dot, the field.
- **"Not declared" beside a parameter.** The pipeline has no run parameter named `mrn`; add it on its **Settings** tab.
- **The request never moves past Registration.** **Wait until the run ends** waits for the run to finish; a run that
  is still in review or failed holds it until **Give up after (hours)**.
- **Every call is "not ok".** The echo answers at `/post` and puts what it was sent under `json`; check the request
  with **Test**, and that **Columns sent** nests the member id as `member.id`.
- **The FHIR fields are empty.** The patient's `fhir_id` comes from `cohort.json`; check the join on `mrn` (step 6).
- **No request opens.** The event route must name the workflow key `patient-journey` exactly, and the workflow must be
  published and **Active**.

Next: [Patient journey 3: on the ward](#rcp-journey-ward).
