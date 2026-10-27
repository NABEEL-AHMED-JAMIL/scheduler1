---
id: tour-registration
title: Registration
summary: The workflow runs the registration pipeline, which checks insurance and fetches the patient record from two connected APIs.
section: Arrival
who: Anyone whose page access includes Runs or Schedules & triggers
where: Run & review › Runs (/runs/latest); Get data in › Connections › API collections (/connections/api-collections)
related: tour-journey-starts, tour-triage
---
The first step of the Patient journey workflow is a **Run pipeline** step: it starts the pipeline **Journey 4 ·
Registration: eligibility then patient record** for Elena's record number, and waits for it to finish. (Fictional
patient, synthetic data.)

## What happened
1. The workflow starts the run with one parameter, `mrn = SV-000117`.
2. The run asks a payer's eligibility service whether Elena's cover is active. It is a sandbox that stands in for a
   real payer, set up as an **API collection** under **Connections**.
3. It joins the answer to the workspace's payer roster. Because the sandbox only echoes what it is sent, the roster,
   not the sandbox, decides whether she is eligible.
4. It fetches her demographic record from a public FHIR test server, a second API collection, and writes one patient
   record to the journey's folder, which the later pipelines read.
5. The run answers `eligible: yes`. The workflow kept the answer as `registration`, so its next step, the condition
   **Registered?**, takes the "yes" branch, straight on to triage. The self-pay counselling task is skipped.

The run had 14 steps and took 1 min 20 sec.

![The registration run's Items tab](tour-registration "The registration run, tab Items: one item, Elena's referral, Done at every step")

## Items: one per patient
A run that works item by item (each patient, each file, each document) has an **Items** tab. Here there is one item,
`referral-SV-000117.pdf`, **Done**. When the same pipeline runs for the ten patients of the cohort, each patient is an
item of their own: if one fails, **Retry failed items** runs only that one again, from the step it failed at.

## Where to see it
- The request's **History** (Review › Approvals › My requests) says "registration: started run #2051" with a link.
- **Run & review › Runs › Latest** lists the run; its page has the tabs **Steps**, **Map**, **Items**, **Outputs** and
  **Log**, and a link to **What this run cost**.

## Learn more
See [Make an API collection](#con-api-collections), [How an API signs in](#con-api-auth), [A run's page](#run-page) and
[The Items view](#run-items). Next: [triage](#tour-triage).
