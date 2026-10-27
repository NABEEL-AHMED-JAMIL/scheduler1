---
id: ts-documents
title: Documents, contracts and reports
summary: A row that does not hold to its data contract, the same document twice, a report over the page limit, a missing picture or field, and too many reports at once.
section: By message
who: Anyone who reads runs, documents or reports; raising the page limit is a workspace administrator's
where: Get data in › Documents › Intake (/documents/intake/upload); See results › Reports › Library (/reports/library); See results › Reports › Settings (/reports/settings)
related: ts-files, ts-connections, ts-approvals
---
Documents, data contracts and reports each check what they are given before they act on it. When a check says no, the
message says which file, row, field or limit, and usually what to do.

## A row that does not hold to its contract
**The message:** `1 of 3001 row(s) do not hold to gl_journal v1; row 3001: $.debit: must have a minimum value of 0`

**Why:** a **Validate** step checks each row against a data contract (the columns, their types and their rules). Its
setting **Rows that do not hold** is `fail`, so the first bad rows stop the step; the message names the contract and
its version, how many rows broke it, and the first problems of the first bad row. The steps after it are skipped, so
nothing is summed or written from data that did not pass.

**Fix:** correct the row in the source file (here, a debit below 0) and run again. If bad rows are expected and should
not stop the run, set **Rows that do not hold** to `drop` (leave them out) or `flag` (keep them, with `_valid` and
`_errors` columns, for a later step to sort out).

![A run stopped by its data contract](ts-contract "One journal line of 3,001 broke the contract: the run stopped at the check, the sums were skipped")

> **Note:** The customer API checks a record against a pipeline's input contract before it makes a run. See
> [The API refused a record](#ts-connections--the-api-refused-a-record-422).

## The same document twice
**The message:** `The same file as "referral-upload-8.pdf" (Uploaded by Summit Valley admin); no second document was
made.` The upload dialog shows the file as **Already here** with the first document's number, and sums up
"1 document(s) made · 1 already here · 0 refused."

**Why:** the console keeps one document per file: the same file uploaded or mailed again is recognised and not read a
second time, so it is not extracted twice.

**Fix:** nothing to fix; open the first document. If the first read had failed, the second is read: "The same file as
"…", whose earlier read had failed: it is read again."

## A report over the page limit
**The message:** `The report lays out to 412 pages; this workspace's reports are at most 300 pages. Narrow the data,
lower a table's maxRows or a repeat's maxItems, make one report per row, or split it into several reports.` It ends with
who may raise the limit:
- "Your administrator can raise this workspace's limit up to N pages in Report Studio › Settings."
- "Only the platform administrator can raise this workspace's limit."
- "N pages is the most the platform allows."

**Why:** every page counts toward the workspace's limit for one report (300 unless its administrators set fewer), a long
table's pages too. A report over it is not made.

**Fix:** the failed job and the report's page offer the way out that applies: **Make one report per row**, **Lower the
table's rows** or **Export the data as CSV**, and for a workspace administrator whose limit it is to raise, **Raise
the limit**. The message's "Report Studio › Settings" is **See results › Reports › Settings** in the menu. In a pipeline, the Generate report step says `The report was not made (FAILED, LIMIT_EXCEEDED):
…`; with **When the checks refuse it** set to continue with a warning, the step goes on without a report.

## A missing picture or field
- A picture the data names but that cannot be read prints as a box that says **Image not available** (or **No image**
  when the row names none), and the report is still made, with a warning such as "That image is not there, or not
  yours to read." or "Storage could not be reached for an image; try again." A report draws at most 500 pictures from
  its data.
- `'patient.name' is not in this data. Nothing is filled in for it: map the data, change the binding, or declare the
  field optional in the data contract.` A field the template uses is missing from the data: map it when you create the
  report, change the template, or mark the field optional.
- `'primary' is not a list in the data, so it cannot be counted or filtered.` A table or repeat expects a list and the
  data has one value: check the data the report was given.

## Too many reports at once
**The message:** `At most 30 generations a minute; try again in 12 s.`

**Why:** each person may generate up to 30 reports a minute. **Fix:** wait the seconds it says.

## Learn more
- Reports: [Report Studio at a glance](#rs-overview).
- Documents: [Upload documents and mail them in](#doc-intake) and [Review a document](#doc-review).
- Contracts: [Data contracts](#con-contracts).
- Approvals of reports and documents: [Approvals](#ts-approvals).
