---
id: trg-document
title: Start a pipeline when a document is approved
summary: Each approved document of a type starts a run; read that document's fields in the pipeline.
section: Start on arrival
who: Anyone whose page access includes Schedules & triggers
where: Build › Pipelines › Schedules & triggers (/pipelines/schedules)
related: trg-file, step-read, pl-placeholders, trg-schedules, doc-when-approved
---
When a document of a type is approved, by a reviewer or automatically, it can start a run. The pipeline then reads that
document's fields straight away: a referral becomes an admission request, a lab report becomes rows of results.

## Make a schedule start when a document is approved

1. Open the schedule in **Build › Pipelines › Schedules & triggers**, or make a new one.
2. Under **Also starts when**, tick **A document is approved**.
3. **Which documents**: choose the document type. Any approved document of it starts a run, whether a reviewer approved
   it or it was approved automatically.
4. **Documents per run**: 1 makes each document its own run. More: documents that waited for a run go together, up to
   this many, and the pipeline reads them all.
5. Save. **What you will get** says "Also when a document of … is approved".

A document approved while a run is going waits its turn.

![A schedule started by approved referrals](trg-document "A document is approved: each approved Referral starts a run")

## Read the documents that started the run

Put a **Read documents** step first and leave its **Document type** empty: it reads the documents whose approval
started this run, one row each with its id, status, approval and the type's fields. Steps can also use
`{{document_count}}`, `{{document_ids}}` and the first document's fields as `{{document.field}}`.

> **Tip:** The same pipeline can also run on a timetable and read every approved document since the last run: give
> **Read documents** a **Document type** and set **Which approved documents** to `last_run`.

## Example

Summit Valley's referrals arrive by Email-in, are read by **Documents**, and are checked by Greta Fischer's team. Each
approved **Referral** starts **Journey 1 · Referral to admission**: it reads the approving document, checks it against
the referral contract, works out the patient's age and urgency, and tells the platform the admission was accepted.

## Limits

| What | Limit |
|---|---|
| Document types per schedule | One |
| Documents per run | 1 to 50 |
