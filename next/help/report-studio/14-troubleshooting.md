---
id: rs-troubleshooting
title: Report Studio troubleshooting
summary: The messages you may meet — a missing field, over the page limit, a missing picture, a refused approval — and what to do.
section: Help
where: Reports › Library (/reports/library)
related: rs-create, rs-limits, rs-approve, ts-documents
---
When a report cannot be made, **no version is made** and the version before it is unchanged: a failed job never
replaces anything. The report's page and the job say why.

## "'primary.x' is not in this data"
The template reads a field the data does not have, and nothing is filled in for it.

- **Fix:** choose **Fix field mapping** and match the field to what the data calls it; or add the field to the
  pipeline's output and run the pipeline again; or, in the template, make the field optional or change the binding.

## Required field missing
In **Data and mapping**, a required field reads **Missing**. A missing value is never filled in for you: pick the
source field the data has, or a newer run that has it.

## Over the page limit
The report would have more pages than the workspace's limit. See [Retention and page limits](#rs-limits--over-the-limit):
make one report per row, lower a table's rows, export the data as CSV, or ask a workspace administrator to raise it.

## A picture is missing
An **Image from data** reads a file that is not there, or that you may not open (pictures are read as the person
generating). Check the file exists in **Analysis › Files**, then generate again. The component's settings say whether a
missing picture prints a placeholder or nothing.

## You cannot approve
- You generated the version: someone else approves it.
- It is not the current version: approve the newest one.
- You lack **Approve and sign reports** in your page access: ask a workspace administrator.

## "Someone saved this draft since you opened it"
Two people edited the same draft. **Reload** to take theirs, or **Save as a copy** to keep yours as a new template.

## The AI assistant says "Not available here now"
The workspace has no active model connection, or data policies keep this data from the model. See
[Your models](#ai-models).

## Too many at once
Past 30 generates or previews a minute you are asked to wait a few seconds. A pipeline making many reports at once
queues them; nothing is lost.

## The signature reads "validity unknown" in Adobe Reader
Expected while the platform uses its test certificate: use **Verify signature** on the report's page.
