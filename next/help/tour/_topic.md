---
title: The tour: a patient's journey
chapter: 2
part: Part I · Start here
icon: activity
blurb: The whole product through one fictional patient at Summit Valley Health System.
paths: 
sections: Arrival | Care | Discharge and results
---
The whole ETL Console through one patient's stay: Elena Marsh, admitted to the fictional Summit Valley Health System
with diabetes, an infected foot wound and heart failure. Each part says what happened, which screen shows it, and which
topic explains it. Every person, patient and result is fictional and every data set synthetic; every model answer is a
DRAFT a person checked.

## Start here
1. [A referral arrives by email](#tour-referral) — Mailed in, read into fields, approved by a person. ![](tour-referral)
2. [The journey starts](#tour-journey-starts) — One approval workflow carries the whole stay. ![](tour-workflow)
3. [Diagnostics](#tour-diagnostics) — Labs, a wound photo and an X-ray, each checked by a person. ![](tour-wound)
4. [The care plan](#tour-care-plan) — Who decides depends on the risk and on who is in. ![](tour-care-plan)
5. [Discharge](#tour-discharge) — The signed PDF, its QR check and the follow-up. ![](tour-discharge)

## Questions
### Is any of this real patient data?
No. Summit Valley, Elena Marsh and every clinician are fictional, and every file, reading and result is synthetic, made
for the demonstration; the X-ray is a public research image assigned to the fictional patient. See
[A referral arrives by email](#tour-referral).

### Does the AI decide anything?
No. A model drafts the wound description, the X-ray triage, the care plan and the discharge summary, each labelled
DRAFT, and a named person approves each one. Measurements are made in code, not by the model. See
[Diagnostics](#tour-diagnostics).

### What happens when the doctor who should approve is away?
A colleague standing in for her decides, and the request's history records that he approved for her. See
[The care plan](#tour-care-plan).

### Why was a senior doctor asked only for this patient?
The workflow has a condition on the care plan's risk: when it is High, the senior physicians are asked as well. See
[The care plan](#tour-care-plan).

### How do I know the discharge PDF is the one that was approved?
Choose **Verify signature** on the report's page, or follow the QR code on the PDF: it says whether the file is intact
and one of the workspace's approved reports. See [Discharge](#tour-discharge).

### Can I build the same journey for my organisation?
The tour uses only what every workspace has: documents, forms, pipelines, an approval workflow, Report Studio and a
dashboard. Start with [the journey starts](#tour-journey-starts) to see how the parts link.

## Related
- getting-started
- documents
- approvals
- runs
- report-studio
- dashboards
