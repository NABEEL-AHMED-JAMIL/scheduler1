---
id: apr-run-review
title: Review a run's results
summary: A pipeline whose results wait for a person: approve, or reject with a reason; one by one or in bulk; runs that must be decided one at a time.
section: Review
who: Workspace administrators decide any run's review; members decide the runs a pipeline names them for, through their task in Review › Approvals
where: Run & review › Review › Runs (/review/runs); Run & review › Review › Approvals (/review/approvals)
related: apr-review-home, apr-approval-steps, apr-bulk, apr-two-party, run-page
popular: Approve or reject a run's results
---
A pipeline can hold its results until a person has looked at them. The run completes, but its status reads
**Completed · waiting for review**, and nothing downstream should treat the results as final until someone approves them.
This is how a model's draft, a triage or a reconciliation gets a person's decision.

## Turn it on for a pipeline
1. Open the pipeline under **Build › Pipelines** and go to **Settings › Review**.
2. Under **Results need review by**, tick **Our team** (and **The customer (through the API)** for a two-party review, see
   [Two-party review](#apr-two-party)).
3. Who is asked, the reminders and the due time are set in **Build › Approval workflows › Pipeline run review**.
4. Tick **Requires individual review (never approved or rejected in bulk)** when every run must be looked at on its own.

![A run review decided by the radiologist](apr-run-review-done "Review › Approvals › Done: a chest X-ray triage run reviewed by the radiologist, with what was reviewed")

## Decide a run
1. Open the run from **Review › Approvals** (a reviewer's task about the run) or **Review › Runs** (administrators), or open
   the run's page.
2. Read **What to review**: the image the run reviewed, the first fields a reviewer looks at (a model's answer is marked
   **DRAFT**: *made by a model for a person to check; not a decision*), the rest on demand, the **Report PDF** and
   **Open the run**.
3. Choose **Approve**, with an optional note of **What you checked**; or **Reject** and say why: a reason is required.
4. On a rejection you may tick **Run the schedule again**, so a new run is made once the cause is fixed.

The decision is recorded in **Review › Approvals** under your name, and the run's status becomes **Completed · approved** or
**Completed · rejected**.

> **Tip:** On the run's own page, **Next steps** at the top holds the same Approve and Reject, with whom it waits on.

## One by one, or in bulk
Runs can be approved several at once from **Review** (see [Decide many at once](#apr-bulk)), unless:
- the pipeline **Requires individual review**: it is skipped by every bulk decision and must be opened and decided on its own;
- the workspace has turned off **Allow bulk approve of runs** under **Administration › Data policies › Bulk review**.

Rejecting in bulk is always allowed.

## Who decides
- A workspace administrator may decide any run's review.
- A member decides the runs the pipeline names them for, by role or by team, through their task in **Review › Approvals**.
  They can read those runs even when the schedule is not theirs.
- No one decides their own request.

## Example
*Journey 8 · Chest X-ray triage* sends each X-ray to the vision model and holds the result for the Radiology team, with
individual review on. Dr. Lena Schmidt opens her task, looks at the image and the DRAFT finding, and approves it on its own;
a bulk approval of the day's runs skips it with *The pipeline requires individual review*.

## Limits
| What | Limit |
|---|---|
| Runs that wait for review | Completed runs only; a failed run has no results to decide |
| Rejecting | Needs a reason |
| Decisions | One per party for each run, final once recorded |
