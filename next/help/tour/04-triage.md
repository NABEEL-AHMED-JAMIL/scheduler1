---
id: tour-triage
title: Triage
summary: A task asks the ward's nurses to fill the triage form; the form starts a pipeline that flags abnormal vitals.
section: Arrival
who: Nurses fill the form from their task; anyone whose page access includes Forms › Submissions reads the answers
where: Run & review › Review › Approvals (/review/approvals); Get data in › Forms › Submissions (/forms/submissions)
related: tour-registration, tour-diagnostics
---
Registered, Elena reaches the ward. The workflow's next step is a **task**: "Nurse triage (fill the Nurse triage
form)", for the team **Ward 4B nursing**. (Fictional patient, synthetic data.)

## What happened
1. The task appears in **Review › Approvals** for every member of Ward 4B nursing, under **My teams**, with a due time
   four hours away.
2. Rosa Alvarez, the charge nurse, fills the **Nurse triage** form with Elena's vital signs and marks the task done;
   the request's history reads
   "Nurse triage (fill the Nurse triage form): done by Rosa Alvarez".
3. Submitting the form starts the pipeline **Journey 5 · Nurse triage and abnormal vitals**. Its run page says
   **Started by A trigger**: the form submitted.
4. The run turns the vitals into numbers (a value that is not a number becomes empty rather than failing the run),
   checks each against its range, works out an early-warning score in code, and keeps one triage file per patient.
5. It keeps only the abnormal readings and sends a notice, "Abnormal vitals", for them. Elena's readings were
   abnormal, so the notice went out.

![The triage run's steps](tour-triage "Journey 5: the triage submission read, checked against its ranges, scored and the abnormal readings sent on")

> **Tip:** A check like this marks the rows that break a rule instead of stopping the run, so one odd reading never
> loses the rest. A contract set to fail stops the run instead; see
> [A row that does not hold to its contract](#ts-documents--a-row-that-does-not-hold-to-its-contract).

## Where to see it
- **Review › Approvals**: the triage task, its due time, **Mark done** and **Pass on**.
- **Forms › Submissions**: each form's answers, who sent them and when, and whether they started the form's pipeline.
- **Run & review › Runs**: the triage run and its seven steps.

## Learn more
See [Build a form](#form-build), [What a submission starts](#form-starts) and
[Who decides: people, roles, teams and managers](#apr-who-decides). Next: [diagnostics](#tour-diagnostics).
