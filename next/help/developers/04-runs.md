---
id: dev-runs
title: Start a run and read it back
summary: Tokens, starting a run with a record and files, idempotency, following it, its steps, outputs, items and review, retrying, run-and-wait, and the result as JSON, PDF, HTML or Markdown.
section: Use the API
who: Your systems, with an API client that has runs:write (start) and runs:read (read)
where: Administration & billing › Developers › Developer portal (/developers/portal)
related: dev-clients, dev-files-forms, dev-webhooks, dev-embed, dev-portal
popular: Start a run from another system
---
Most integrations do one thing over and over: start a run of a pipeline with some data, then read what it made. This
article says what happens at each step, for an administrator or a project lead. The exact calls, with samples in curl,
Python and Node.js, are in the Developer portal's **Quickstart** and the **API reference**.

## The path of a run
1. **Get a token.** The system exchanges its client id and secret for a token that lasts 15 minutes, and asks again
   when it ends.
2. **Find the pipeline.** The list of pipelines gives each one's id, its **input contract** (what a record must look
   like) and its parameters.
3. **Upload files first**, if the run needs any (see [Files and forms](#dev-files-forms)).
4. **Start the run** with the record, the file ids and, if you like, a **reference** of your own (an order number).
   The record is checked against the input contract before anything is stored: a record that does not fit is refused
   with each wrong field named, and no run starts.
5. **Follow it**, by reading the run until it is completed, or better, by a [webhook](#dev-webhooks) that says when it
   is.
6. **Read what it made**: its outputs.

## Send it twice, get one run
Every call that creates something carries an **Idempotency-Key** of your system's choosing. The same key with the
same request within 24 hours answers the first result again and starts nothing new; the same key with a different
request is refused. Your developers make one key per piece of work (an order, a form) and reuse it on every retry.

## What a system can read back
| It reads | What it holds |
|---|---|
| The run | Its status, its times, its attempt and your reference |
| Its steps | Each step of the latest attempt, in order, with its status, rows in and out, and times |
| Its outputs | The files it was given and made, each by its own file id, and its review; a report's PDF beside its data |
| Its items | For a pipeline that works item by item (each file, recording, document or row): each item's status, the step it failed at and why, its files |
| Its review | Who must decide and what they decided |
| Its result | The rows of its final output, for a quick answer |

A system never sees a bucket, a storage key or a connection: a file is only ever its id.

## Decide a review
When a pipeline asks for your organisation's decision on its results, your system records it with `reviews:write`:
approve, or reject with a reason (and, for a run it started, ask for it to run again). The console's reviewers and
your system see the same review.

## Retry a failed run
A failed run can be retried from the step that failed (the steps before it are not run again or billed again) or
from the start. The run keeps its id; its attempt number goes up.

## Run and wait
A pipeline that answers in seconds (an eligibility check, a lookup) can be started and waited for in the same call,
for 1 to 60 seconds. If it finishes in time, the answer carries its result; if not, it is followed as usual.
Columns your data policy marks sensitive are masked in the result.

## The result as JSON, PDF, HTML or Markdown
The system that starts a run chooses the format it gets the result in -- on the run's result, on run and wait, and for
a webhook's `run.completed`:

| Format | What it is |
|---|---|
| JSON (the default) | The rows of the run's final output, masked by your data policy |
| PDF | The run's report (its Generate report step): the signed PDF once it is approved and signed |
| HTML | The report's page; with no report, the rows as a table |
| Markdown | Made from the report's page: headings, tables, lists; pictures and signatures as links to the PDF. Its first line says which report it is from and whether it is signed. Markdown is never signed itself: the PDF is the record. With no report, the rows as a table |

A run with no report has no PDF. A run that made one report per row names the one it wants. Anything else -- Word,
Excel -- is refused, naming the four formats. A pipeline marked sensitive keeps its report from the API in every
format, as it keeps its files; the JSON stays masked. Choosing a format costs nothing more than the call.

## Limits
| What | Limit |
|---|---|
| A token | 15 minutes |
| An Idempotency-Key | Kept 24 hours; 8 to 128 characters |
| Waiting for a run | 1 to 60 seconds |
| A run's result through the API | The first 100 rows, up to 16 KB (a report as PDF, HTML or Markdown: the whole report) |
| A webhook's result formats | Up to 5 MB of documents a delivery; past it, the system reads that format through the API |
| Runs of one pipeline at a time | One in flight; a second start while one runs is refused |

## Example
Summit Valley Health System's *Partner portal* starts the pipeline *Partner starts a run through the API* for each lab
record, with the record's id as its reference and as its Idempotency-Key. A record missing its test code is refused at
once with the field named. When the same request is sent twice after a network error, the second answer is the first
run. The portal then reads the run's outputs and downloads the report made for each result.
