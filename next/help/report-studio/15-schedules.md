---
id: rs-schedules
title: Generate many reports on a schedule
summary: A report schedule — template, data, one report per patient, approval, delivery once approved (library, email link, bucket folder, webhook) and when it runs — and its runs.
section: Generate
who: Anyone with Generate reports; the reports are approved by the people the schedule names
where: Reports › Schedules (/reports/schedules)
related: rs-create, rs-pipeline, rs-approve, rs-versions, rs-copy-without-names
popular: Send a weekly report per patient once it is approved
---
A **report schedule** makes many reports at once, on the days you choose, and sends each one where it needs to go once
it is approved. For example: every Monday at 07:00, one wound summary for each patient seen in the last 7 days, approved
by the wound care leads, then emailed as a sign-in link to the referring clinic and saved as a PDF in your bucket.

![A report schedule](rs-schedule "A report schedule: six steps on the left, the Summary and the Checks before it runs on the right")

## Make a schedule
Open **Reports › Schedules** and choose **New schedule**. Name it, then go through the six steps.

1. **Template**: a published template. **When the template changes**: **Use the latest published version** (a newer
   version is used from the next run) or **Keep version N**. **Watermark until approved**: **DRAFT** marks every copy
   until the report is approved; the approved, signed PDF is clean.
2. **Data**: **Read from** a pipeline's latest run or a saved data source (an uploaded file, pasted data or a file in a
   bucket). **Rows**: every row, or the rows of the last N days by a date field of the data. For a pipeline, **If the run
   failed**: **Skip this run and tell me**, or **Use the last good run and tell me**. Under the fields, the page says
   which run it read, how many rows, and whether the data has every field the template needs.
3. **How many reports**: **One report of all rows**, or **One report per value of a field** (for example one per
   `patient_id`). **Name each report** with the data's fields in braces and the run's own names — `{year}`, `{month}`,
   `{week}`, `{date}`, `{n}` — and the page shows the name of the first report.
4. **Approval**: **Who approves** (Reports › Settings' approvers, the workspace administrators, or a team), **Approvals
   needed** (one, or two where the second signs) with what the approval means, and **Not approved in**: after that many
   days the approvers are reminded, and after twice as many you are told.
5. **Deliver once approved**: the **Report library** always. Then, as you choose: **Email a sign-in link** to people of
   this workspace, **Put the PDF in a bucket folder**, **Call a webhook**, and **Also a version without names** (each
   approved report's [copy without names](#rs-copy-without-names), kept with it and saved beside the PDF in the bucket).
6. **When**: **Once**, **Every day**, **Every week** (on the days you pick) or **Every month** (a day, or the last day), at
   a time in the workspace's time zone. For a pipeline, **Wait for the pipeline if it is still running** (up to 2 hours),
   and **Skip a run when the pipeline has not run again since the last one**.

```A report name
Wound summary · {patient_id} · week {week}
```

## Test it first
**Make the first 3 now (test)** draws the first three reports from the data as it is now, with the DRAFT mark, beside
step 3. Open one to read it whole. Nothing is kept, billed or sent, and nobody is asked to approve them.

**Checks before it runs**, on the right, says whether the data has every field the template needs, whether the test
reports had problems, whether the bucket folder is writable (**Check the folder is writable** saves a small check file
named `.etl-console-write-check` there), and how many people can approve. **Save and turn on** saves the schedule
only when no check fails.

The checks also include the **fax check** of the first report: what a black-and-white fax would lose (text under 8 pt,
colour-only meaning, light text and rules, pictures that print dark), each with its block. It is advice and never stops
a save. See [Show as Fax and the fax check](#rs-designer--show-as-fax-and-the-fax-check).

## What a run does
1. At its time it reads the data — for a pipeline, its newest successful run — keeps the rows of the window, and makes
   one report per value (at most 1,000 a run). Each report's data is frozen when the run starts.
2. Each report waits for approval in the approvers' **Review › Approvals**, marked DRAFT until then. Whoever set up the
   schedule (or chose **Run now**) cannot approve its reports.
3. Once a report is approved and signed, it goes out: the email, the PDF in the bucket folder, the webhook event. The
   report's page shows each delivery under **Delivered**.

On the schedule's page, **Runs** lists each run — **Done**, **Skipped** (and why), **Failed** (and why) — and opens its
reports; **Deliveries** lists where each approved report went. **Run now** starts a run at once; **Pause** stops it until
you turn it on again; **Archive** ends it, keeping its runs and reports.

![The schedules](rs-schedules "Reports › Schedules: each schedule's state, when it runs, its next and last run")

> **Privacy:** The email holds no patient data — not even the report's name, which may carry a patient code: only who
> issued it, the document type, the report's number and version, and a link. The reader signs in to open it, so only
> people of this workspace receive it.

> **Note:** A bucket folder is named by the run's date only (`{year}`, `{month}`, `{week}`, `{date}`), never by a value
> of the data, and each PDF by its report number: `RPT-0042-v1.pdf`.

> **Tip:** The webhook event is `report.approved`, with the report's number, document type, whether it is signed, what
> each approval meant and a sign-in link. Subscribe to it in **Developers › Webhooks**.

> **Warning:** **Will fail** on a schedule means its last check or run found a problem — a field the template needs
> that the data no longer has, a template with no published version, more than 1,000 reports. Open it to see why.

## Limits
| What | Limit |
|---|---|
| Reports a run makes | 1,000 |
| Rows a run keeps after its filter | 20,000 |
| Data a run reads | 50 MB |
| People an email goes to | 50 |
| Waiting for a pipeline still running | up to 8 hours (2 by default) |
| A delivery that fails | tried 6 times over about 4 hours, then you are told |
| A schedule's run history | kept as long as the workspace keeps report versions (Reports retention) |
