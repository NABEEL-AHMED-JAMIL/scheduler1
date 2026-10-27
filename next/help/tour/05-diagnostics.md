---
id: tour-diagnostics
title: Diagnostics
summary: Lab results arrive from the partner lab, the wound photo is measured and described as a DRAFT, and the chest X-ray waits for the radiologist.
section: Care
who: Reviewers decide runs in Review › Runs and Approval steps in Review › Approvals; the team each pipeline names
where: Run & review › Review (/review/all); Get data in › Documents › Intake (/documents/intake/file-drop); Run & review › Runs (/runs/latest)
related: tour-triage, tour-care-plan
---
Three kinds of result reach Elena's file while she is on the ward, each through its own pipeline, and each is checked by
a person before anything relies on it. (Fictional patient and people, synthetic data; the X-ray is a public research
image assigned to the fictional patient.)

## Lab results from the partner lab
1. The partner lab, Northgate Labs, sends each result to the console's API as an event, one per test: HbA1c, CRP, white
   cells, potassium, creatinine and glucose.
2. Each event starts a run of **Journey 6 · Lab results from the partner lab**. The run checks the result against the
   lab result data contract, flags abnormal and critical values in code, keeps the result in the journey's folder and,
   for a critical value, notifies the physicians. Elena's HbA1c was critical.
3. The pipeline holds its results for review. Dr. Anika Patel approves each run ("Lab result reviewed."); its status
   reads **Completed · approved**.

## The wound photo
1. Daniel Kim, a ward nurse, drops three photos of the wound, each with a centimetre ruler beside it, through
   **Documents › Intake › File drop**. Each file starts a run of **Journey 7 · Wound photo: measure, describe,
   wound-care review**.
2. The run measures the wound against the ruler **in code**, not by the model. A vision model only writes a
   description, labelled DRAFT.
3. The run compares the visit with the last one, works out how much the area changed, and stops at an **Approval**
   step: "Wound care approves the measurement".
4. Sam Harper, the wound specialist, approves it ("Measurement checked against the photo."). The run goes on and makes
   one wound report per photo, a PDF in **Reports › Library**.

![The wound photo run](tour-wound "Journey 7: measured in code, described as a DRAFT, approved by wound care, one report per photo")

## The chest X-ray
1. The X-ray dropped in the same way starts **Journey 8 · Chest X-ray triage with radiologist review**. A vision model
   writes a DRAFT triage.
2. The pipeline is set so each run is reviewed one by one, never in bulk. Dr. Lena Schmidt, the radiologist, reads it
   and approves: "Lung fields reviewed; DRAFT label noted."

![The X-ray run with its review](tour-xray "Journey 8: the DRAFT triage and the radiologist's approval in the Review card")

> **Warning:** A model's answer is a draft for a person to check, never a decision. The tour's pipelines say DRAFT in
> the step's name and in what they keep, and a person approves every one.

## Where to see it
- **Review › All waiting**: everything waiting for a person, with one count on the menu; **Runs** for runs held for
  review, **Approvals** for Approval steps.
- The run's own page: its **Review** card shows who decided, when and their comment; **AI answers** shows what the
  model said.

## Learn more
See [AI and media steps](#step-ai), [Which models may see which data](#ai-data-levels),
[Review a run's results](#apr-run-review) and [Approval steps inside a run](#apr-approval-steps). Next: [the care plan](#tour-care-plan).
