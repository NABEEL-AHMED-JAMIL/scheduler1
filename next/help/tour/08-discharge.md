---
id: tour-discharge
title: Discharge
summary: The AI drafts the discharge summary, a physician approves it, and a pipeline makes the signed PDF with its QR code and books the follow-up.
section: Discharge and results
who: Physicians approve; anyone whose page access includes Reports › Library reads the report
where: Run & review › Review › Approvals (/review/approvals); See results › Reports › Library (/reports/library)
related: tour-ward, tour-health-chart
---
When Elena is well enough to go home, the last part of the workflow puts her discharge on paper, approved, signed and
sent on. (Fictional patient and clinicians, synthetic data.)

## What happened
1. **Ready for discharge?**: a task for the Physicians team. Dr. Minh Nguyen marks it done.
2. **Discharge summary draft (AI)**: the workflow runs **Journey 12 · Discharge summary draft**, which reads the earlier
   journey runs and the care plan and asks the model for a summary, labelled DRAFT.
3. **Physician approves the discharge**: the Physicians team is asked; Dr. Nguyen approves.
4. **Discharge packet**: the workflow runs **Journey 13 · Discharge packet: signed PDF, QR verify, follow-up**. Its run:
   - makes the discharge summary from the published template **Discharge summary**, with the workspace's brand,
     a signature and stamp, and a QR code for checking the copy;
   - books the follow-up appointment with a scheduling sandbox and works out its date;
   - sends the follow-up to the patient portal by a signed webhook;
   - and notifies the team that the packet is ready.
5. The report waits for approval in **Review › Approvals**. Approving it signs the PDF: the report's page in **Reports ›
   Library** reads **Signed**, "Approved and signed: Dr. Minh Nguyen".
6. **Journey stages** keeps the request's milestones as a dataset, and **Tell the requester** ends the request,
   **Approved**.

![The discharge summary in the Library](tour-discharge "Reports › Library: the discharge summary, version 1, approved and signed, with its PDF and HTML")

## Check the signed copy
On the report's page choose **Verify signature**. It checks a version's PDF, or a file someone sent you, against the
workspace's approved reports: whether it is intact and whether it is one of ours. The QR code on the PDF leads to the
same check.

> **Warning:** A signature proves who approved which file and that it has not changed since. It does not prove the
> content is right: that is what the person approving reads it for.

## Where to see it
- **Reports › Library**: every report and its versions; the report's page has **Versions**, **Activity** and
  **Access**, the PDF and HTML, and where the version came from (template, pipeline run, generation job, approval).
- The run's **Outputs** tab: the PDF the run kept, with **View** and **Download**.

## Learn more
The Report Studio topic explains templates, brand profiles, approval, signing and verifying a copy; start with
[Report Studio at a glance](#rs-overview). Next:
[the health chart](#tour-health-chart).
