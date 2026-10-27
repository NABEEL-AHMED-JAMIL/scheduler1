---
id: rcp-signed-report
title: A signed report with a signature, a stamp and a QR code
summary: Upload a physician's signature and the records stamp, have them approved, place them on a discharge summary with a QR code, and have the PDF approved and digitally signed.
section: Healthcare
who: A workspace administrator uploads the signature and stamp; a different person approves them; a physician (whoever may approve reports) approves the report
where: Reports › Assets & branding (/reports/assets); Reports › Templates (/reports/templates); Reports › Settings (/reports/settings); Run & review › Review › Approvals (/review/approvals)
related: rs-approve, rs-branding, rs-components, rcp-branded-report, rcp-journey-discharge, rcp-image-grid
popular: Sign a report with a signature and a stamp
---
A report approved in Report Studio is **digitally signed**: the PDF records who approved it and when, and any later
change to the file breaks the signature. The **signature picture** and the **stamp** are how the page looks; the
digital signature is what proves the approval. This recipe puts both on a one-patient discharge summary and adds a QR
code that opens the report's page, so whoever holds a printed copy can check it.

## What you'll build

- Two approved assets: **Dr. Anika Patel signature** (a **Signature** that belongs to her) and **Summit Valley Medical
  Center · Clinical records** (a **Stamp**).
- A template, **Discharge summary**, with the patient's name and MRN, diagnosis, follow-up, the course, the medicines on
  discharge, a **QR code** (*Verify this report*) and a **Signature** block with the stamp beside it.
- Report Studio settings that send every new version to the **Physicians** team.
- One report, **Discharge · SV-000117**, approved and signed, that **Verify signature** says is unchanged.

Summit Valley's *Discharge summary* template and its signed report RPT-0054 are the figures. For the whole discharge
(the AI draft and the workflow), see [Patient journey 5](#rcp-journey-discharge).

## What you need first

- At least three people: the administrator who uploads (Summit Valley admin), a second person who may approve assets
  and reports (Jordan Reyes, a workspace administrator), and the physicians who approve reports, in a team
  **Physicians** (Dr. Anika Patel, Dr. Minh Nguyen). See [Add a person](#adm-people) and
  [Teams with a lead](#rcp-team-run-review). The physicians need **Approve and sign reports** in
  their page access.
- The brand profile from [A branded one-page report](#rcp-branded-report).
- The sample files (drawn in code, fictional; never use a real person's signature):
  - [signature-dr-anika-patel.png](/help/samples/signed-report/signature-dr-anika-patel.png)
  - [stamp-clinical-records.png](/help/samples/signed-report/stamp-clinical-records.png)
  - [discharge-sample.json](/help/samples/signed-report/discharge-sample.json): Elena Marsh's discharge (fictional).

## Build it

### Upload and approve the signature and the stamp

1. As the administrator, open **Reports › Assets & branding** and choose **Upload asset**.
2. **Kind** **Signature**, **Name** `Dr. Anika Patel signature`, **Belongs to** Dr. Anika Patel, **File**
   `signature-dr-anika-patel.png`. **Upload**. Its card says it waits for approval.
3. Again: **Kind** **Stamp**, **Name** `Summit Valley Medical Center · Clinical records`, **File**
   `stamp-clinical-records.png`. **Upload**.
4. Sign in as Jordan Reyes (anyone who may approve, but not the uploader). Open each asset (its **Details**) and choose
   **Approve v1**, or decide the task in **Review › Approvals**. Both cards now show **Approved**.
5. A signature is placed only by the person it belongs to, or with their grant. Dr. Patel (or whoever may grant it)
   opens the signature's page and, under **Grants**, picks the template's author in **Grant use to…** and chooses
   **Grant**. Do the same on the stamp's page.

![Assets & branding with the approved signature and stamp](rcp-b-assets "Assets & branding: the stamp, Dr. Anika Patel's signature, the letterhead and the logo, each Approved")

### Turn on signing and choose who approves

1. Open the brand profile **Summit Valley standard**, and under **Confidentiality line, signatures and stamps** turn on
   **Digitally sign PDFs when approved**. Optionally add the signature and stamp under **Add an approved signature** and
   **Add an approved stamp**. **Save draft**, then publish the new version.
2. Open **Reports › Settings**. Under **Who approves** pick the team **Physicians**, tick **Ask for approval of every new
   version**, and **Save**.

### The template

1. **Reports › Templates** → **New template**: **Name** `Discharge summary`, **Category (optional)** `Clinical
   documents`. **Create the draft**.
2. Fill the canvas with `discharge-sample.json` (**Paste JSON**), and keep it as the test sample `Elena Marsh`.
3. Add, in this order:

| Component | Settings |
|---|---|
| **Heading** | **Text** `Discharge summary · {{primary.name}}` |
| **Text** | `MRN {{primary.mrn}} · DRAFT reviewed and approved by the attending physician` |
| **Row and columns** (two columns) | a **Label and value** `Diagnosis` = `primary.diagnosis`; a **Label and value** `Follow-up` = `primary.follow_up` |
| **Text** | `{{primary.course}}` |
| **Heading** (level 3) | `Medicines on discharge` |
| **List** | **Collection** `meds_on_discharge` |
| **QR code** | **Verify this report (signed in)**, **Size (mm)** `22`, **Caption** `Scan to verify this report` |
| **Signature** | **Signature** `Dr. Anika Patel signature · v1`, **Stamp beside it** the records stamp, **Width** `42mm`, **Caption** `Approving clinician`, **Where** `end` |

4. **Validate**, then **Publish v1**.

![The Discharge summary template with its QR code, signature and stamp](rcp-b-discharge-design "The designer, Signature selected: Dr. Anika Patel's signature with the records stamp beside it, placed at the end")

### Generate and approve

1. On the template's page choose **Create report**, **Report name** `Discharge · SV-000117`, data **Test sample**
   `Elena Marsh`, **Preview and check**, keep **PDF**, and **Generate v1**.
2. The version asks for approval at once (the setting above). The person who generated it cannot approve it: the report
   page says *You generated it; someone else approves it.*
3. Dr. Minh Nguyen (in Physicians) opens the task in **Review › Approvals**, reads the pages beside it and chooses
   **Approve and sign v1**. A rejection needs a reason.

## Check it worked

- The report's page shows **Version 1**, **Ready**, **Signed**, and **Approved and signed** *Dr. Minh Nguyen* with the
  time.
- The PDF has the QR code under the medicines, and the signature with the red records stamp beside it at the end.
- **Verify signature** → **Check version 1** says **The signature holds.** *This is RPT-… v1 as approved, unchanged
  since*, with **Signed by** Dr. Minh Nguyen, **Unchanged** *Yes*, **Certified** *Yes* and **In this workspace** *Yes*.
- Scanning the QR code opens the report's page in the console for anyone signed in to the workspace.

![A signed discharge summary](rcp-b-discharge-signed "The report's page: version 1, ready and signed, approved and signed by Dr. Minh Nguyen")

![Verify signature](rcp-b-verify "Verify signature: the signature holds, signed by Dr. Minh Nguyen, unchanged and certified")

> **Note:** Adobe Reader shows the signature as intact with "validity unknown" while the platform's test certificate is
> in use; **Verify signature** in the console does not need that trust.

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| The signature cannot be picked on the template | It is not approved yet, or you have no grant. Approve it (someone other than the uploader) and ask its owner for a grant. |
| **Approve v1** is greyed out on the asset | You uploaded it. Someone else approves it. |
| The approver's task never comes | **Who approves** in **Reports › Settings** names a team nobody is in, or **Ask for approval of every new version** is off: use **Ask for approval** on the report's page. |
| You cannot approve your own report | By design: whoever generated a version never approves it. Give the workspace at least two people who may approve. |
| The PDF has the signature picture but no digital signature | **Digitally sign PDFs when approved** is off on the brand profile the report used, or the version was never approved. |
| The QR code opens a sign-in page | It opens the report's page for signed-in members of the workspace only; it is not a public link. |

> **Warning:** The signature proves who approved which file and that it has not changed since. It does not make the
> content correct: the approver checks it first.
