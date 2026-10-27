---
id: step-people
title: "The Approval step: a person decides in the middle of a run"
summary: Pause a run until its reviewers approve; what they see, who they are, how long they have, and what a rejection does.
section: AI, media and people
who: A workspace administrator adds the step; the reviewers it names decide in Review › Approvals
where: Build › Pipelines › a pipeline › Steps › Add step (/pipelines/list); Run & review › Review › Approvals (/review/approvals)
related: step-ai, pl-settings, step-outputs, step-glance, apr-approval-steps
---
An **Approval** step pauses the run at that point until its reviewers approve. Approved, the run goes on with the same
rows, unchanged; rejected, or not decided in time, the run fails, with the reason the reviewer gave. Use it where a
person must look before anything leaves: before a report is signed, before a file is sent, after an AI step whose answer
matters.

It is one of two ways a person approves a pipeline's work. The other, the pipeline's **review** (its **Settings** tab),
waits on the whole run's results after the last step. See [Pipeline settings](#pl-settings--review-whether-a-person-approves-the-results).

![The Approval step's settings](step-people "Approval: what the wound-care team sees, and how long they have to decide")

## Set up an Approval step

1. Add **Approval** from **Add step** where the run should wait.
2. **Task title**: what the reviewers' task says. It fills from the run and the first row, such as
   `Wound {{mrn}}: {{area_cm2}} cm²` or `Approve {{rows}} results of run {{run}}`.
3. **What to check**: the instructions shown on the task.
4. **Fields**: name and value pairs shown on the task, such as `Abnormal` = `{{abnormal_count}}`.
5. **Reviewers**: **Reviewers are** `role` or `team`, and **Role or team**: `TENANT_ADMIN` (the workspace's
   administrators) or `TENANT_USER` (every member) for a role, or the team's id. Empty: the pipeline's review reviewers,
   else the workspace's administrators.
6. **Decide within (hours)**: 72 unless you say. Nobody deciding in this time fails the run.
7. Choose **Apply**, then **Save**.

## What the reviewers do

The task appears in **Run & review › Review › Approvals** for the people the step names, with its title, instructions,
fields and the number of rows. They open it, check the rows, and approve or reject; a rejection may need a reason. How
reminders and overdue tasks are handled is set in **Approval workflows › Pipeline step approval**.

> **Note:** When the pipeline's settings have **Requires individual review**, its Approval steps' requests are never
> approved or rejected in bulk with others.

## Example

In Summit Valley's **Journey 7 · Wound photo**, after the photo is measured and described, the step "Wound care approves
the measurement" asks the Wound care team, with the title `Wound {{mrn}}: {{area_cm2}} cm²`, to decide within 24 hours.
Only then is the wound report made. In **Controlled substance count reconciliation**, pharmacist Avi Cohen rejects a
count with a reason, and the run fails naming it.

## Limits

| What | Limit |
|---|---|
| Decide within | 1 to 720 hours (72 by default) |
| Task title | 200 characters |
| What to check | 2,000 characters |
| A field's value | 500 characters |
