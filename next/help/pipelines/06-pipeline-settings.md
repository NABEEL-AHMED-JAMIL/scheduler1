---
id: pl-settings
title: Pipeline settings
summary: Reviews and who reviews, one by one, data sensitivity, tags, how long outputs are kept, the default timeout and what a failed step does.
section: Save and settings
who: A workspace administrator
where: Build › Pipelines › a pipeline › Settings (/pipelines/list)
related: pl-builder, pl-placeholders, pl-versions, step-people, apr-run-review, apr-approval-steps, sec-data-policies
---
A pipeline's **Settings** tab holds what applies to all its steps: where the first step's input comes from, the run
parameters, the defaults every step inherits, the data's sensitivity and tags, and whether a person reviews the results.
They are saved with the steps, as part of the same version.

![The Settings tab of a pipeline](pl-settings "Settings: source, run parameters, run defaults and data sensitivity")

## Source

**Source** says where the first step's input comes from when no **Read** step says. Leave it at **Default (none: the
first step makes its own rows)** for almost every pipeline: its first step reads a file, an API, a database or
documents. **The task payload: one row, a column per tag** is for a pipeline whose run is handed a record, for example
by a form, an event or the API.

## Run parameters

What a run may be given: by **Run with…**, by a backfill or through the API. A scheduled run takes the defaults. See
[run parameters](#pl-placeholders--run-parameters).

## Run defaults

| Setting | What it does | Blank |
|---|---|---|
| **Keep datasets (hours)** | How long a run's step outputs are kept, 1 to 720 | 24 |
| **Default timeout (seconds)** | The time limit for each try of a step that sets none, 1 to 86,400 | 600 |
| **If a step fails** | What happens when a step that does not say fails: **Fail the run**, **Continue with the next step** or **Skip the rest and complete** | Fail the run |

A step's own panel can say otherwise under **How it runs**. Some steps have a longer time limit of their own (for
example **Transcribe audio** and **Read text from pages**, two hours); see [the steps at a glance](#step-glance).

## Data sensitivity and tags

1. Under **Data sensitivity**, choose **Public**, **Internal** or **Sensitive**. Patient data (PHI) is **Sensitive**. The
   workspace's data policy for that level decides which models the pipeline's steps may use and how long a run keeps its
   files.
2. Under **Tags**, type short words separated by commas, such as "research, pilot". A rate card may price a tag's
   pipelines at a price of their own.

The **Data** column of the Pipelines list shows the sensitivity, or **Not set**.

## Review: whether a person approves the results

1. Under **Results need review by**, tick **Our team**, **The customer (through the API)**, or both. A run's results then
   start as waiting for review. Your team approves or rejects them on the run's page or in **Review**; the customer
   decides through the API from its own portal.
2. Tick **Requires individual review (never approved or rejected in bulk)** when every result must be looked at on its
   own. Each run's review, and each request of this pipeline's **Approval** steps, then has to be decided one by one:
   bulk approve and bulk reject skip them.
3. Who is asked, and the reminders, are set in **Approval workflows › Pipeline run review**. The workflow for **Approval**
   steps inside the run is **Approval workflows › Pipeline step approval**.

![The Review settings of a pipeline](pl-review "Review: who must approve the results, and whether they are decided one by one")

> **Note:** The run's review waits on the whole run's results after the last step. An **Approval** step pauses the run in
> the middle until its reviewers approve. A pipeline can use either or both; see [Approval](#step-people).

## Example

Summit Valley's **Journey 8 · Chest X-ray triage** marks its results for review by **Our team**, with the Radiology team
asked, and **Requires individual review**: a radiologist opens every draft finding on its own, and none can be approved
in bulk with others. Its data sensitivity is **Sensitive**.

## Limits

| What | Limit |
|---|---|
| Keep datasets | 1 to 720 hours |
| Default timeout | 1 to 86,400 seconds |
| Who changes settings | A workspace administrator |

Which steps **Add step** offers is switched on and off for the whole workspace in **Settings › Task Registry**, not
here.
