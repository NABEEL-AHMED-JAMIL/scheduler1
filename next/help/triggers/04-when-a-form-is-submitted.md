---
id: trg-form
title: Start a pipeline when a form is submitted
summary: Let each submission of a form start a schedule's run, and read the answers in the pipeline.
section: Start on arrival
who: Anyone who may build forms sets it; anyone the form is shared with can submit it
where: Get data in › Forms › Forms (/forms/builder)
related: trg-file, trg-workflow, step-read, pl-placeholders, form-starts
---
A form can start a pipeline. Each submission is kept, written to the workspace inbox as JSON, and the schedule you choose
runs with it, so a nurse's triage form can be scored, checked and filed the moment it is sent.

## Link a form to a schedule

1. Make the schedule first: a schedule of the pipeline that should handle the answers, usually **Only when started**
   (see [Run a pipeline on a timetable](#trg-schedules--make-a-schedule)).
2. Open **Get data in › Forms**, and open the form.
3. Open its **Settings** tab.
4. In **When submitted, start**, choose the schedule. **Nothing: keep the submission** starts nothing.
5. Check the form's **Status** is **Active**: only an Active form takes submissions.
6. Save the form.

The Forms list shows what each form starts in its **Starts** column.

![The Forms list with what each form starts](trg-form "Forms: the Starts column names the pipeline each form's submissions start")

> **Tip:** A form can also start an approval workflow (its **Approval** setting). It may start both: the workflow for the
> people who decide, the pipeline for the data.

## Read the answers in the pipeline

The submission arrives as the run's own file. A **Read CSV/JSON/Parquet** step with **Bucket** and **File** left empty
reads it as one row, a column per answer. Later steps use the answers by their names, such as `{{mrn}}`.

## Example

Rosa Alvarez, the charge nurse on Ward 4B, fills in the **Nurse triage** form. It starts **Journey 5 · Nurse triage and
abnormal vitals**: the vitals are turned into numbers, checked against their ranges, scored, and an abnormal reading
sends a warning to the charge nurse.

## Limits

| What | Limit |
|---|---|
| Schedules one form starts | One |
| Submissions a form takes | Only while it is Active |
