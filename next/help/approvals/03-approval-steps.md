---
id: apr-approval-steps
title: Approval steps inside a run
summary: An Approval step pauses a run at that step until its reviewers approve; what the task shows; rejecting fails the run with your reason.
section: Review
who: Workspace administrators add the step; the reviewers it names decide it in Review › Approvals or on the run's page
where: Build › Pipelines (/pipelines/list); Run & review › Review › Approvals (/review/approvals)
related: apr-run-review, apr-review-home, apr-who-decides, run-page, ai-steps
---
Sometimes a person must agree before a run goes on: a measurement before the wound report is made, a list of drug
interactions before it is sent to the ward, a count before a write-off. An **Approval** step pauses the run at that point.
The steps before it have run; the steps after it wait. Approved, the run continues; rejected, or not decided in time, the
run fails with the reason.

This differs from a run's review ([Review a run's results](#apr-run-review)), which holds a finished run's results.

![An Approval step in a run's steps](apr-step-in-run "A run's Steps: step 10, Wound care approves the measurement, approved by Sam Harper before the report was made")

## Add an Approval step
1. Open the pipeline's **Steps** and add **Approval** from **Add step from the Task Registry…**, after the steps whose
   results need the decision.
2. **Task title**: what the reviewers' task says, filled from the run and the first row, such as
   `Wound {{mrn}}: {{area_cm2}} cm²`.
3. **What to check**: the instructions shown on the task.
4. **Fields**: name and value pairs shown on the task, such as `Abnormal = {{abnormal_count}}`.
5. **Reviewers**: a role or a team. Empty, it goes to the pipeline's review reviewers, or else to the workspace's
   administrators.
6. **Decide within (hours)**: nobody deciding in this time fails the run.
7. Save the pipeline. Who is asked and the reminders follow **Build › Approval workflows › Pipeline step approval**.

> **Tip:** Keep a copy of the rows before the Approval step (a **Save file** or **Upload to bucket** step). The task can then
> list the rows to approve; without one it shows only the step's counts.

## What the reviewer sees
The run's status reads **Running · waiting for approval**, and the task in **Review › Approvals** shows:
- the **Pipeline**, **Run** and **Step**, the **Rows waiting**, when it was **Requested** and by when to decide;
- **What to check**, the **Figures the step reported** and the **Rows to approve** (with **Fewer columns** / **All columns**);
- the **Report PDF** if one was made, and **Open the run**.

![An approval task, decided](apr-step-approval-done "Review › Approvals › Done: the wound measurement approval, with the rows the step held")

## Decide it
1. Open the task from **Review › Approvals**, or open the run: **Next steps** at the top holds the same decision.
2. Choose **Approve**, with an optional note of **What you checked**: the run continues in a moment.
3. Or choose **Reject**, say why, and press **Reject** again: the run fails in a moment, and its message carries your
   reason, such as *Rejected by Claire Martin: Every line unmatched*.

The decision is recorded in **Review › Approvals** as yours. A pipeline set to **Requires individual review** keeps its
Approval steps out of bulk decisions too.

## Example
In *Journey 7 · Wound photo*, step 10 *Wound care approves the measurement* waits for the Wound care team with the task
*Wound SV-000117: area in cm²*. Sam Harper checks the measurement against the photo and approves it: *Measurement checked
against the photo*. The run goes on and makes one wound report per photo.

## Limits
| What | Limit |
|---|---|
| Decide within | 1 to 720 hours (default 72); not decided in time, the run fails |
| What to check | 2,000 characters |
| Task title | 200 characters |
