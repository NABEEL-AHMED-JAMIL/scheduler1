---
id: trg-workflow
title: Start a pipeline from an approval workflow
summary: A workflow's Run pipeline step runs a schedule with the request's values, waits for it, and keeps fields of its answer for later decisions.
section: Start on arrival
who: Anyone who may change approval workflows; the change takes effect when the workflow is published
where: Build › Approval workflows (/workflows/designer)
related: pl-run-pipeline, trg-events, trg-form, trg-run-now, apr-workflows
---
An approval workflow moves a request from person to person: a task here, an approval there, a condition that decides
the way. A **Run pipeline** step in it runs a pipeline at that point, with the request's values as the pipeline's
parameters, and can wait for the run before the next person is asked. The answer's fields are then on the request, for a
condition or an assignee to use.

## Add a Run pipeline step to a workflow

1. Open **Build › Approval workflows** and choose the workflow.
2. Choose **Add a step** (or **Add after** on a step) and pick **Run pipeline**.
3. **Schedule to run**: the schedule of the pipeline to run. A schedule **Only when started** is the usual choice.
4. **Parameters**: each parameter the pipeline declares, with its value from the request by name (`{{subject.mrn}}`) or
   an earlier step's kept value (`{{registration.patient_id}}`). Empty: the pipeline's default. A parameter the pipeline
   does not declare is marked **Not declared**, and publishing refuses it.
5. Tick **Wait until the run ends, its approvals included** to hold the workflow until the run is over. Off: the next
   step starts as soon as the run is queued.
6. With waiting on, **Keep how it ended as** names the outcome, such as `registration`. A condition after the step reads
   `registration.ok`, `registration.status` (Completed, Failed, TimedOut) or `registration.message`; **Add a condition on
   it** puts one right after.
7. Tick **Keep values from its answer** to keep fields of the run's answer: **From** **Its final output** or a step,
   **Keep** (**The first row's fields**, **The rows (up to 100)**, **How many rows**, or each field's sum, lowest,
   highest or average), and the **Fields** to keep (a JSON column's field by a dot, such as `summary.age`).
8. Publish the workflow. Requests already running keep their version.

![A Run pipeline step in an approval workflow](trg-workflow "The Patient journey workflow: its first step runs the registration pipeline with the patient's MRN and waits for it")

## Example

Summit Valley's **Patient journey** workflow starts when an admission is accepted. Its first step runs **Journey 4 ·
Registration: eligibility then patient record** with `mrn` = `{{subject.mrn}}`, waits for it and keeps the outcome as
`registration`. The next step, **Registered?**, sends a patient who is not eligible to the self-pay counselling team
and everyone else to nurse triage. Later steps run the care-plan draft and the discharge summary the same way, before
Dr. Anika Patel approves.

## Limits

| What | Limit |
|---|---|
| Values kept from an answer | Up to 16 KB; masked columns stay masked |
| Rows kept | Up to 100 |
| Each run it starts | A run of its own, billed like any run |
