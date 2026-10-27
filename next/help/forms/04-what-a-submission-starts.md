---
id: form-starts
title: What a submission starts
summary: A submission can start a pipeline, an approval workflow, or both; or only be kept.
section: Build and share
who: Workspace administrators
where: Forms › Forms (/forms/builder)
related: form-build, form-submissions, form-dataset
---
A form on its own keeps what people send. In its **Settings**, a form can also start work with each submission: a
pipeline that does something with the answers, an approval workflow that asks the right people to decide, or both.

## Start a pipeline
1. Open the form in the builder and choose **Settings**.
2. Under **When submitted, start**, pick the schedule to run. **Nothing: keep the submission** starts nothing.
3. Choose **Save**.

The submission is written to the workspace inbox as JSON, and the schedule runs with it: a pipeline whose **Read
CSV/JSON/Parquet** step names no file reads it as one row, each answer a column named by its field's key. The form's
page says "Submitting starts this form's pipeline." The forms list shows the schedule under **Starts**.

## Start an approval workflow
1. In **Settings**, under **Approval**, pick a workflow. **None: no approval** asks no one.
2. Choose **Save**.

Each submission starts the workflow. Its status (**Pending**, **Approved**, **Rejected**, **Overdue**) and the stage it
is at show on **Forms › Submissions**. Workflows are built in **Approval workflows** (the **Workflow designer** link
opens it).

![A form's Settings: a pipeline and an approval workflow](form-settings "Settings: When submitted, start a pipeline; Approval: a workflow; and where its dataset is kept")

## Both
Pick a schedule under **When submitted, start** and a workflow under **Approval**. The builder's line under the form's
name says what it starts, such as `starts workflow "Patient journey"`, and the form's submissions show both the run and
the approval.

> **Tip:** Check a submission's answers in the pipeline with a **Validate** step and a data contract, so a malformed
> answer stops there with its field named. See [Data contracts](#con-contracts).

> **Note:** A file a person attaches can be sent to Document Intelligence too, with **Send its files to Document
> Intelligence** on its **File upload** field. See [Build a form](#form-build).

## How each submission went
On **Forms › Submissions**, each submission's **Status** is **Received** (kept, nothing started), **Run started** with
the run's number (a link to its run log), or **Run not started**, with the reason under **Details**. See
[Submissions](#form-submissions).

## Examples
- **Expense claim** starts the pipeline "Expense claims with receipts" and the **Expense approval** workflow: Kevin Lee's
  claim waits at **Manager approves** for Claire Martin, while the pipeline totals its lines.
- **Admission intake** starts the **Patient journey** workflow and the intake pipeline, which checks the answers against
  the `journey_intake` contract and files them by MRN.
- **Find a trial** starts only a pipeline: it searches recruiting clinical trials for the condition and city given.
