---
id: rcp-journey-referral
title: "Patient journey 1: a referral by email, read and reviewed"
summary: Set up the workspace for the journey, mail a referral in, have a person check it, and let the approval start the admission pipeline.
section: The patient journey
who: A workspace administrator builds it; a document reviewer checks the referral
where: Documents › Intake (/documents/intake/email-in); Documents › Document types (/documents/types); Review › Documents (/review/documents); Build › Pipelines (/pipelines/list)
related: rcp-journey-registration, tour-referral, doc-intake, doc-types, doc-review, trg-document, con-contracts
popular: Build the patient journey yourself
---
This is the first of six recipes that rebuild the tour's patient journey in your own workspace, starting from an empty
one. Each recipe builds one stretch and ends with a check. Together they make the whole stay of the fictional patient
Elena Marsh, from a referral letter to a dashboard.

| Recipe | What it adds |
|---|---|
| 1 (this one) | Email-in, the Referral type, the review, and the pipeline an approved referral starts |
| [2](#rcp-journey-registration) | The **Patient journey** approval workflow, and registration through two API collections |
| [3](#rcp-journey-ward) | The nurse triage form, the daily vitals, the lab results, the wound photo and the chest X-ray |
| [4](#rcp-journey-care-plan) | The AI care-plan draft, the senior-doctor rule, out of office and the medication check |
| [5](#rcp-journey-discharge) | The discharge summary draft and the signed PDF with its stamp and QR code |
| [6](#rcp-journey-chart) | The health chart report and the Patient journey dashboard |

> **Note:** Every person, patient and value here is fictional and every file synthetic. A model's answer is a DRAFT a
> person checks; nothing in these recipes is clinical advice.

## What you'll build

A referral for Elena Marsh (record number `SV-000117`) mailed to the workspace becomes a **Referral** document. The
console reads the patient, the reason and the urgency from it. A reviewer fills in what it could not read and approves
it. The approval starts the pipeline **Journey 1 · Referral to admission**: it checks the referral against a data
contract, works out the patient's age and urgency rank, keeps the referral in the journey's folder, and tells the
workspace through its own API that the admission was accepted. That event opens the journey's workflow, which you build
in recipe 2.

![The admission pipeline's run](rcp-j-referral-run "Journey 1's run: the approved referral read, checked, shaped, kept, and the admission announced (fictional patient)")

## What you need first

Once, for the whole journey:

1. **A storage connection** that is the workspace's default, under **Get data in › Connections › Storage** (see
   [Connect your storage](#con-storage)). The recipes call it *your bucket* and keep everything under a folder
   `journey/`.
2. **The people and teams** in the table below, under **Administration › Teams** (see [Teams](#adm-teams)). Other names
   work as long as you use them the same way throughout.
3. **A model connection** with a text model and a vision model, for the AI steps of recipes 3 to 5, under **Settings ›
   Model connections** (see [Your models](#ai-models)).
4. **Email-in turned on**: **Get data in › Documents › Intake › Email-in**, **Turn on** (an administrator).

| Team | Who is in it | Decides |
|---|---|---|
| HIM | Greta Fischer | the referral's review |
| Revenue cycle | Marcus Owens | self-pay counselling |
| Ward 4B nursing | Rosa Alvarez (lead), Daniel Kim | triage, the daily alerts |
| Wound care | Sam Harper, Daniel Kim | the wound measurement |
| Radiology | Dr. Lena Schmidt | the X-ray triage |
| Physicians | Dr. Anika Patel (lead), Dr. Minh Nguyen, Dr. Chidi Okafor | the care plan, the discharge |
| Senior physicians | Dr. Chidi Okafor | high-risk care plans |
| Pharmacy | Avi Cohen, Lucia Díaz | the medication check |

For this recipe, download:

- [referral-SV-000117.pdf](/help/samples/patient-journey/referral-SV-000117.pdf): the two-page referral; page 2 is a scan.
- [journey-referral-sample.json](/help/samples/patient-journey/journey-referral-sample.json): one referral record, for
  the data contract.

## Build it

### The document type and the contract

1. Open **Get data in › Documents › Document types**, choose **Add from starters**, tick **Referral** under
   **Healthcare**, and choose **Add**.
2. Open **Get data in › Connections › Data contracts** and choose **New from sample**.
3. **Name** `journey_referral`, **Direction** *In: a customer's payload*, **Sensitivity** sensitive.
4. Paste the contents of `journey-referral-sample.json` into **Sample** and choose **Propose schema**.
5. Tick **Required** on `patient_id`, `patient_name`, `reason` and `urgency`, and choose **Save v1**.

### The pipeline

1. Open **Build › Pipelines** and choose **New pipeline**. Under **Add steps yourself**, type the **Name**
   `Journey 1 · Referral to admission` and choose **Create and add steps**.
2. On the **Steps** tab, add the six steps of the table below with **Add step from the Task Registry…**, in order. Give
   each the **Key** shown, fill its settings and choose **Apply**.
3. On the **Settings** tab, set **Data sensitivity** to **Sensitive**.
4. Choose **Save**.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read documents | `referral` | **Document type** empty: it reads the document whose approval started the run |
| 2 | Validate | `check` | **Contract** `journey_referral`; **Rows that do not hold**: flag (mark them, never drop them) |
| 3 | Compute | `shape` | The five formulas below |
| 4 | Save File | `keep` | **File name** `referral-{{mrn}}.json`, **Format** json, **One file per row** on |
| 5 | Upload to bucket | `keep_bucket` | Your bucket, **Object key** `journey/referrals/{{mrn}}.json`, **Format** json, **One file per row** on |
| 6 | Call API | `admit` | **Send** once; the request that posts the event `admission.accepted` (see the tip); **Columns sent** `mrn`, `name`, `urgency`, `member_id`, `reason`, `age` |

The formulas of the **Compute** step, one per line: the column, then its formula. Tick **Empty when it cannot be worked
out** on `age`, so a missing date of birth leaves it empty instead of failing the run.

```Compute: MRN, name, age and urgency rank
mrn          = patient_id
name         = patient_name
age          = round(days_between(date_of_birth, today()) / 365.25, 0)
urgency_rank = if(urgency == 'urgent', 1, if(urgency == 'soon', 2, 3))
member_id    = insurance_member_id
```

> **Tip:** Step 6 needs an API collection with one request that posts an event to your workspace's own API, and an API
> client with the `events:write` scope (see [API clients](#dev-clients) and [Events and event routes](#dev-events)). If
> your platform does not let pipelines call that address ([What the console may call](#con-addresses)), leave step 6
> out and start the journey from a form instead; recipe 2 shows how.

### The schedule and its trigger

1. On the pipeline's page choose **Schedule**. **Schedule name** `Journey 1 · Referral to admission`; under **When it
   runs**, **Only when started**.
2. Under **Also starts when**, tick **A document is approved**. **Which documents**: **Referral**. **Documents per run**:
   `1`.
3. Choose **Create schedule**. **What you will get** says "Also when a document of Referral is approved".

### Mail the referral in

1. On **Get data in › Documents › Intake › Email-in**, copy the workspace's address.
2. From any mailbox, send a message to it with the subject `Referral: Elena Marsh (SV-000117)` and
   `referral-SV-000117.pdf` attached.

## Check it worked

1. Within a minute or two, **Documents › Intake › Email-in** lists the attachment under **What arrived**, outcome
   **Taken**.
2. **Documents › Documents in** shows it as a **Referral**. The letter has no referral date and names nobody it is
   referred to, so it waits in **Review › Documents**.
3. As the reviewer, Greta Fischer, open it in **Review › Documents**, fill in the two missing values (`2026-10-18`,
   and `Summit Valley Medical Center, Ward 4B`) and approve it. **Documents › Documents in** now reads **Approved**.
4. **Run & review › Runs** shows a run of **Journey 1 · Referral to admission**, **Started by** *A trigger*, 6 of 6
   steps completed, 1 row in and 1 row out. Its **Outputs** tab holds `referral-SV-000117.json`.
5. Once recipe 2 is built, the last step's event opens a **Patient journey** request for Elena: see it in **Run &
   review › Review › Approvals**, tab **My requests**.

## Common mistakes

- **The run does not start.** The trigger must name the type **Referral** and the schedule must be **Active**. Only an
  approval starts it: a document still in review does not.
- **A second mail of the same file makes no new document.** That is by design; the copy is listed as **Duplicate**.
  To try again, send a different file.
- **Validate stops the run.** Set **Rows that do not hold** to flag, not fail, so a referral with a gap is marked and
  still goes on.
- **Call API is refused.** The workspace's own API is not on the list of addresses pipelines may call. Use the form
  entry of recipe 2 instead.
- **The age is empty.** The date of birth did not come through the review; check the document's date of birth.

Next: [Patient journey 2: the workflow and registration](#rcp-journey-registration).
