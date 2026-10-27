---
id: tour-journey-starts
title: The journey starts
summary: The approved referral feeds a pipeline, and an event opens the Patient journey approval workflow.
section: Arrival
who: Building workflows is a workspace administrator's; anyone whose page access includes Approval workflows may read them
where: Build › Approval workflows (/workflows/designer); Run & review › My requests (/review/requests)
related: tour-referral, tour-registration, tour-care-plan
---
Once the referral is approved, the console takes over the paperwork. One pipeline turns the referral into an admission,
and an approval workflow, **Patient journey**, carries Elena from registration to the signed discharge packet. (A
fictional patient and synthetic data, as everywhere in this tour.)

## What happened
1. The approval itself starts the pipeline **Journey 1 · Referral to admission**: its run page says **Started by A
   trigger**. The run reads the approved referral, checks it against the workspace's data contract for referrals
   (marking any problem, never dropping the row), works out Elena's age and the urgency, and keeps the referral as a
   file in the journey's folder.
2. Its last step calls the workspace's own API once to send an event, **admission.accepted**. The first try of that
   step failed on a setting; once it was corrected the run was retried from step 6, and its page shows **Attempt 2**,
   the five earlier steps "Reused from attempt 1".
3. An event route sends that event to the **Patient journey** workflow, which opens a request for Elena:
   "Event admission.accepted", with her name, record number, age, reason and urgency as the request's details.

![The Patient journey workflow on its map](tour-workflow "Build › Approval workflows: the Patient journey workflow, 16 steps, its first step selected")

## The workflow's map
**Build › Approval workflows** draws a workflow as a map, from **Request starts** to the end. Patient journey has 16
steps of five kinds:

| Kind | In Patient journey |
|---|---|
| Run pipeline | Registration, Care-plan draft (AI), Medication safety check, Discharge summary draft (AI), Discharge packet |
| Condition | Registered? and High risk in the care plan? |
| Task | Self-pay counselling, Nurse triage (fill the Nurse triage form), Ready for discharge? |
| Approval | Attending physician approves the care plan, Senior physician approves, Physician approves the discharge |
| Notify and record | Tell the ward, Journey stages (kept as a dataset), Tell the requester |

Select a step to read its settings on the right. The first, **Run pipeline**, names the schedule to run, passes the
request's record number as the pipeline's parameter (`{{subject.mrn}}`), ticks **Wait until the run ends, its
approvals included**, and keeps the answer as `registration`, so the next condition can read `registration.eligible`.

> **Note:** Publishing a workflow makes a new version. A request already running keeps the version it started on:
> Elena's request ran on version 3 while version 5 was published later.

## Where to see it
- **Build › Approval workflows**: the workflow, its **Steps**, its **Versions** and a **Test run**.
- **Run & review › Review › Approvals**, tab **My requests**: the request, its details and its **History**, one line
  per step, newest last.

## Learn more
See [Design an approval workflow](#apr-workflows), [Events and event routes](#dev-events) and
[Start a pipeline when a document is approved](#trg-document). Next:
[registration](#tour-registration).
