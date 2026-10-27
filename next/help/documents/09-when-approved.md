---
id: doc-when-approved
title: When a document is approved
summary: Start a pipeline each time a document of a type is approved, by a reviewer or on its own.
section: Use the data
who: Workspace administrators set the schedule; anyone with Document types sees what each type's approval starts
where: Documents › Document types (/documents/types); Pipelines › Schedules (/pipelines/schedules)
related: doc-approved-data, doc-types, doc-review, doc-file-drop
popular: Start a pipeline when a document is approved
---
An approved document is often where work begins: a referral that should open an admission, an invoice that should be
matched to its purchase order. Set a schedule to start when a document of a type is approved, and each approval starts
a run with that document.

## See what a type's approval starts
On **Documents › Document types**, the column **When approved, starts…** names, for each type, the schedules its
approval starts, each a link to the schedule's runs. A schedule whose document start is switched off says **(trigger
off)**; one that is not active says **(schedule not active)**. **Nothing yet** means no schedule starts on it.

![The Document types list with what each approval starts](doc-types "When approved, starts…: the schedules each type's approval starts")

## Start a pipeline on approval
1. On **Documents › Document types**, in the type's row, choose **Set it on a schedule**. A new schedule opens with the
   document start on and the type picked. (Or open **Pipelines › Schedules** and a schedule of your own.)
2. Pick the pipeline the schedule runs.
3. Under **When it runs**, in **Also starts when**, make sure **A document is approved** is on.
4. In **Which documents**, pick the document type. An approved document of this type starts a run, whether a reviewer
   approved it or it was approved automatically.
5. In **Documents per run**, `1` starts a run per document. A larger number lets documents that waited for a run go
   together, up to that many, and the pipeline reads them all.
6. Save the schedule.

A document approved while a run is going waits its turn. In the pipeline, the **Read documents** step reads the
documents that started the run.

> **Tip:** A rejected document starts nothing. Only what a person (or the type's auto-approve line) passed reaches the
> pipeline, so the pipeline can trust the values it gets.

> **Note:** The schedule can start in other ways too (on a timetable, when a file arrives, when someone chooses Run now).
> The document start adds to them.

## Example
At Summit Valley, an approved **Referral** starts "Journey 1 · Referral to admission". When Greta Fischer approves Elena
Marsh's referral, the run reads it, works out her age and urgency, saves the referral as a file and sends the event that
admits her: the start of the patient's journey.

## Limits
| What | Limit |
|---|---|
| Documents per run | 1 to 50 |
| Types per document start | One type per schedule |
