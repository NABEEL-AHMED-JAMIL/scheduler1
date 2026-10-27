---
title: Documents
chapter: 9
part: Part IV · Get data in
icon: file
blurb: Send documents in, read their fields, review what was unsure and use the approved data.
paths: /documents, /review/documents
sections: Send documents in | Document types | Read and review | Use the data
---
Documents turns the paper that reaches you (referrals, lab reports, insurance cards, invoices) into checked data.
Upload them or mail them in; each one is read, matched to its document type and split into fields, and a person
checks what the reading was unsure of. Approved values land in the type's dataset and can start a pipeline.

## Start here
1. [Document types](#doc-types) — Add the ready-made types you receive, or make your own. ![](doc-starters)
2. [Upload documents and mail them in](#doc-intake) — Upload files or give senders your workspace's own address. ![](doc-email-in)
3. [Review a document](#doc-review) — Check the page beside its fields, correct, approve or reject. ![](doc-review)
4. [Approved data](#doc-approved-data) — One row per approved document, to download or read in a pipeline. ![](doc-approved-data)
5. [When a document is approved](#doc-when-approved) — Start a pipeline each time a document of a type is approved. ![](doc-types)

## Questions
### What is the difference between Upload and the file drop?
Upload (and Email-in) make documents: each file is read and split into fields for review. The file drop only stores
files for pipelines and starts the schedules waiting for them. See [The file drop](#doc-file-drop).

### Why is a value flagged "check" when it looks right?
It was read less surely than the type's **Auto-approve at** line (80 % when there is none), or a rule found a problem.
Confirm it against the page and approve. See [How documents are read](#doc-reading).

### Our Email-in address has leaked. What now?
An administrator chooses **New address** on **Intake › Email-in**: the old address is shut out at once. Give the new
one to your senders. See [Upload documents and mail them in](#doc-intake--give-it-a-new-address-or-turn-it-off).

### I uploaded the same file twice. Do I now have two documents?
No. A file the workspace already has, by any channel, is kept once and listed as **Duplicate**. See
[How documents are read](#doc-reading--one-document-per-file).

### Why can't I approve these documents in bulk?
The workspace's review policy may not allow it, a document may be claimed by someone else, or its rules fail. See
[Review many documents at once](#doc-bulk-review).

### Can I catch an invoice that does not add up, or one sent twice?
Yes: give the type rules such as **A table column adds up to a field** and **Not a duplicate of another document**. See
[Checks on a document](#doc-checks).

### Where do the approved values go?
To the type's dataset on **Documents › Approved data**, with your corrections. See [Approved data](#doc-approved-data).

## Related
- connections
- approvals
- pipelines
- triggers
- forms
