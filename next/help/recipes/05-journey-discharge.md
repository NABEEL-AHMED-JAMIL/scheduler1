---
id: rcp-journey-discharge
title: "Patient journey 5: the discharge summary, signed, stamped and with a QR code"
summary: An AI discharge draft a physician approves, then a PDF from a published template, signed on approval with the records stamp and a QR code that checks the copy.
section: The patient journey
who: A workspace administrator builds it; a second person approves the signature and stamp; a physician approves the report
where: See results › Reports › Assets & branding (/reports/assets); See results › Reports › Templates (/reports/templates); See results › Reports › Library (/reports/library); Build › Approval workflows (/workflows/designer)
related: rcp-journey-care-plan, rcp-journey-chart, tour-discharge, rs-overview, rs-templates, step-outputs, dev-webhooks
---
When the patient is ready to go home, the last stretch of the workflow puts the discharge on paper. A model drafts the
summary from the care plan and the latest vitals; a physician approves the draft; a pipeline makes the PDF from a
published template; and the physician's approval of that PDF signs it.

## What you'll build

- The prompt **Discharge summary (DRAFT)** and the pipeline **Journey 12 · Discharge summary draft**.
- The brand profile, the signature and stamp, and the template **Discharge summary** with a signature block and a QR
  code.
- The pipeline **Journey 13 · Discharge packet: signed PDF, QR verify, follow-up**: the report, a follow-up booking,
  the follow-up sent to a patient portal, and a notice.
- The workflow's last steps: **Ready for discharge?**, **Discharge summary draft (AI)**, **Physician approves the
  discharge**, **Discharge packet**, **Journey stages** and **Tell the requester**.

![The discharge packet's run](rcp-j-packet-run "Journey 13's run: the discharge summary made from the published template, the follow-up booked and sent, and the notice")

## What you need first

- Recipes 1 to 4 done: `journey/careplans/` and `journey/progress/progress.csv` hold Elena's care plan and vitals.
- Your logo, a drawn signature and a stamp as PNG images with a transparent background (make your own; never use a
  real person's signature).
- [discharge-sample.json](/help/samples/patient-journey/discharge-sample.json): test data for the template.
- Optional: a webhook to your patient portal ([Webhooks](#dev-webhooks)) and a scheduling request in the **Payer and
  partner sandboxes** collection of recipe 2 (POST `{{echoBase}}/post`, body `{{payload}}`), named `Scheduling: book an
  appointment`.

## Build it

### The draft

1. Save the prompt **Discharge summary (DRAFT)** with the care plan's system instructions (recipe 4), the message and
   schema below, and the variables `name`, `mrn`, `reason`, `interventions`, `goals_n`, `follow_up` and `progress`.
2. Make `Journey 12 · Discharge summary draft` with the run parameter `mrn`, **Sensitive**, a schedule **Only when
   started**, and the steps below.

```Message template: Discharge summary (DRAFT)
Patient {{name}} ({{mrn}}). Recorded admission diagnosis: {{reason}}. Care-plan interventions: {{interventions}} ({{goals_n}} goals). Care-plan follow-up: {{follow_up}}. Latest vitals: {{progress}}. diagnosis: copy the recorded admission diagnosis above word for word (restating the record, not diagnosing). course: 2-3 sentences on the stay, from the interventions and the latest vitals. meds_on_discharge: the medicines named above, or an empty list. follow_up: one sentence from the care-plan follow-up.
```

```Output schema: Discharge summary (DRAFT)
{ "type": "object", "properties": { "diagnosis": { "type": "string" }, "course": { "type": "string" }, "meds_on_discharge": { "type": "array", "items": { "type": "string" } }, "follow_up": { "type": "string" } }, "required": ["diagnosis", "course", "meds_on_discharge", "follow_up"] }
```

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `cps` | **Prefix** `journey/careplans/{{param.mrn}}`, **Read as** json, **At most objects** 50 |
| 2 | Remove duplicates | `cp` | **Key columns** `mrn`; **Keep** last |
| 3 | Compute | `only_flag` | `wanted = if('{{param.mrn}}' == '' or mrn == '{{param.mrn}}', 1, 0)` |
| 4 | Filter | `only` | `wanted` equals `1` |
| 5 | Read CSV/JSON/Parquet | `prog` | **File** `journey/progress/progress.csv` |
| 6 | Remove duplicates | `latest` | **Key columns** `mrn`; **Keep** last |
| 7 | Compute | `progress_line` | `progress = concat('SpO2 ', text(spo2), ', HR ', text(hr), ' at ', taken_at)` |
| 8 | Compute | `cp_json` | **Reads** `only`; `goals_n = json_array_length(goals)` (empty when it cannot be worked out) |
| 9 | Join | `context` | **Join with** `progress_line` **On** `mrn`; **Keep** left |
| 10 | AI prompt | `draft` | **Prompt** Discharge summary (DRAFT); **Fields** `diagnosis`, `course`, `meds_on_discharge`, `follow_up` as `discharge_follow_up`; **Calls at once** 1 |
| 11 | Select columns | `ds` | `mrn`, `name`, `diagnosis`, `course`, `meds_on_discharge`, and `discharge_follow_up` as `follow_up` |
| 12 | Compute | `stage` | `stage = 'discharge'` |
| 13 | Save File | `keep` | **File name** `discharge-{{mrn}}.json`, **Format** json, **One file per row** on, **JSON columns** `meds_on_discharge` |
| 14 | Upload to bucket | `keep_bucket` | **Object key** `journey/discharge/{{mrn}}-run-{{run}}.json`, **Format** json, **One file per row** on |

> **Note:** Summit Valley's own Journey 12 also reads the journey's earlier runs with **Read runs**, so the draft can
> list what ran and how each review was decided. The shorter pipeline above leaves that out. Not yet verified end to
> end.

### Brand, signature and stamp

1. In **See results › Reports › Assets & branding**, upload the logo, the signature and the stamp. A signature or a
   stamp is usable only after someone other than the uploader approves it (the built-in workflow **Signature or stamp
   approval**).
2. Make a brand profile with the logo, your colours and the footer line "Confidential: synthetic demonstration data",
   tick **Digitally sign PDFs when approved**, publish it and make it the default.
3. In **Reports › Settings**, under **Who approves**, choose the team **Physicians**, and tick **Ask for approval of
   every new version**.

### The template

1. In **Reports › Templates** choose **New template**, name it `Discharge summary`, and lay it out in the designer: a
   heading with the patient's name and MRN, the diagnosis, the course, the medicines on discharge as a list, and the
   follow-up.
2. Add a **Signature** block (the physician's signature, **Stamp beside it**: the records stamp) and a **QR code** whose
   content is **Verify this report (signed in)**.
3. Test it with `discharge-sample.json`, keep it as a test sample, and choose **Publish v1**
   ([Templates and the library](#rs-templates)).

### The packet

Make `Journey 13 · Discharge packet: signed PDF, QR verify, follow-up` with the run parameter `mrn`, **Sensitive**, a
schedule **Only when started**, and these nine steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `discharges` | **Prefix** `journey/discharge/{{param.mrn}}`, **Read as** json, **At most objects** 50 |
| 2 to 4 | Remove duplicates, Compute, Filter | | As steps 2 to 4 of the draft |
| 5 | Generate report | `report` | **Use a saved template** Discharge summary, **Version** the latest published; **One report per row** on; **At most reports** 12; **Brand profile** yours; **Formats** PDF and HTML; **JSON columns** `meds_on_discharge`; **Report name** `Discharge · {{mrn}}` |
| 6 | Call API (optional) | `book` | **Scheduling: book an appointment**; **Send** each; **Columns sent** `mrn`, `follow_up` as `reason`; **Variables** `payload` = `{{row}}`; **Column prefix** `appt_` |
| 7 | Compute | `when` | `follow_up_at = date_add(today(), 7, 'day')` |
| 8 | Send webhook (optional) | `portal` | Your patient portal webhook; **Send** `rows`; **Columns** `mrn`, `follow_up_at`; **Fields** Follow-up = `{{follow_up_at}}`; **Wait** 20; **Fail unless delivered** on |
| 9 | Send Notification | `tell` | **Title** `Discharge packet ready`; **Message** "The signed discharge summaries wait for the doctor's approval in Review › Approvals."; **Severity** `SUCCESS`; **To** `owner`; **Send** `always` |

### The workflow's last steps

Open **Patient journey** and add, after **Tell the ward**:

1. **Task** `Ready for discharge?`: the team **Physicians**, **Due in (hours)** 72.
2. **Run pipeline** `Discharge summary draft (AI)`: Journey 12, `mrn` = `{{subject.mrn}}`, wait, **Keep how it ended
   as** `discharge`, **Fields** `diagnosis`, **Give up after (hours)** 4.
3. **Approval** `Physician approves the discharge`: the team **Physicians**, **Due in (hours)** 8, a rejection needs a
   reason, rejected ends the request.
4. **Run pipeline** `Discharge packet: signed PDF and follow-up`: Journey 13, `mrn` = `{{subject.mrn}}`, wait, **Keep
   how it ended as** `packet`, **Give up after (hours)** 4.
5. **Save to dataset** `Journey stages`: **Dataset** `journey-stages`.
6. **Notify** `Tell the requester`: the requester, "The patient journey for {{mrn}} is complete."
7. At **Request ends**, **If the request ends here, it ends as** *Approved*. **Publish version 3**.

## Check it worked

1. Dr. Nguyen marks **Ready for discharge?** done. The Journey 12 run completes with one item; its
   `discharge-SV-000117.json` has the diagnosis copied from the referral, a short course, the medicines and the
   follow-up, all a DRAFT.
2. After **Physician approves the discharge**, Journey 13 runs: 9 of 9 steps, one item. **Reports › Library** has
   **Discharge · SV-000117**, version 1, with its PDF and HTML; the run's **Outputs** has the PDF too.
3. The report waits in **Review › Approvals** for the Physicians team. Dr. Nguyen chooses **Approve and sign**: the
   report reads **Signed**, "Approved and signed: Dr. Minh Nguyen". He could not approve it if he had generated it.
4. On the report's page, **Verify signature** says the PDF is intact and one of the workspace's approved reports. The
   QR code on the PDF opens the same check for anyone signed in.
5. The request ends **Approved**; **Journey stages** holds a row for it, and the requester is told.

## Common mistakes

- **The PDF is not signed.** Signing happens on approval, and only when the brand profile has **Digitally sign PDFs
  when approved**. A version nobody approved is not signed.
- **No signature on the page.** The signature and the stamp were not approved yet, or the uploader approved them (not
  allowed). Ask a second administrator.
- **"Not in this data" when the report is made.** The template reads a field the run does not have; compare the
  template's **Data it needs** with the columns of step 4 ([A missing picture or field](#ts-documents--a-missing-picture-or-field)).
- **The medicines print as one line of brackets.** Name `meds_on_discharge` under **JSON columns** in both pipelines,
  so the list is read as a list.
- **The webhook step fails the run.** **Fail unless delivered** stops the run when the portal does not answer; leave
  the step out until the portal is ready.

> **Warning:** A signature proves who approved which file and that it has not changed since. It does not prove the
> content is right: that is what the physician reads it for.

Next: [Patient journey 6: the health chart and the dashboard](#rcp-journey-chart).
