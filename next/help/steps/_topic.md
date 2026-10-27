---
title: Step reference
chapter: 6
part: Part III · Build
icon: list
blurb: Every step a pipeline can use, grouped by what it does, with its settings, defaults and limits.
paths: /pipelines/list, /settings/task-registry
sections: Read and shape | Combine and check | AI, media and people | Outputs | At a glance
---
Every step a pipeline can use, by what it does: read rows in, shape them, combine them, check and enrich them, work on
recordings, documents and images, wait for a person, and send the results out. Each step's settings are described by the
names on its panel, with their defaults, an example from Summit Valley Health System and the step's limits. The last
article puts every step on one table.

## Start here
1. [Read rows in](#step-read) — Files, folders, APIs, databases, approved documents and past runs. ![](step-read)
2. [Shape the rows](#step-shape) — Choose columns, filter, work out values, clean and sort. ![](step-shape)
3. [Combine and call](#step-check) — Join, stack and group; check against a contract; call an API. ![](step-check)
4. [Use AI and media](#step-ai) — Prompts, transcripts, conversions, OCR and image measurements. ![](step-ai)
5. [Send the results out](#step-outputs) — Files, buckets, reports, notices and webhooks. ![](step-outputs)
6. [See every step at once](#step-glance) — The settings, defaults and limits of all steps on one table. ![](step-registry)

## Questions
### Why is a step marked (disabled) in Add step?
It is switched off in this workspace (in **Settings › Task Registry**), or it is an administrator's step and you are
not one. The hint beside it says which. See [Every step at a glance](#step-glance).

### Which steps can only an administrator add?
**Call API**, **Read runs**, **Run pipeline**, **Send webhook** and **Upload to bucket**. See
[Every step at a glance](#step-glance).

### Why can't I add Write Database?
Writing to a database is not part of this release: database connections are read-only, and pipelines never write into
your systems. See [Write Database is switched off](#step-outputs--write-database-is-switched-off).

### How do I read only the files that are new since the last run?
Set **Read S3**'s **Which objects** to `last_run`. A failed run moves nothing on, so its files come again. See
[Read S3](#step-read--read-s3).

### How do I call an API once for every row?
Use **Call API** with **Send** set to `each` (or `batch` for many rows a call), up to 8 calls at once. See
[Call API](#step-check--call-api).

### Is an AI step's answer final?
No. A model's answer is a DRAFT for a person to check; follow an important AI step with an **Approval** step or the
pipeline's review. See [AI prompt](#step-ai--ai-prompt).

### What happens when a step reaches a limit?
It fails and says which limit, before or while it works; it never cuts rows silently. See
[Data a step can hold](#step-glance--data-a-step-can-hold).

## Related
- pipelines
- connections
- ai
- documents
- report-studio
- approvals
