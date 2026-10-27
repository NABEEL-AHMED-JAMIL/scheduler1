---
id: trg-run-now
title: Run now and Run with…
summary: Start a schedule's run at once, give one run its own parameters or AI models, and run several schedules together.
section: Run and schedule
who: Anyone whose page access includes Schedules & triggers; in a workspace our team manages you can still run schedules
where: Build › Pipelines › Schedules & triggers (/pipelines/schedules)
related: trg-schedules, trg-backfills, pl-placeholders, pl-try, run-runs
---
Every run belongs to a **schedule**: a pipeline plus when it runs. **Run now** starts a schedule's run at once,
whatever its timetable says. **Run with…** does the same and lets you give that one run its own parameter values, or
the AI model each AI step uses, without changing the schedule.

## Run a schedule now

1. Open **Build › Pipelines › Schedules & triggers**.
2. Find the schedule: search by id, schedule or pipeline, or filter by type and run status.
3. Open its **⋮** menu and choose **Run now**. The run is queued and the row's **Run status** follows it.

![The Schedules & triggers list](trg-list "Schedules & triggers: live run counts, then each schedule with its pipeline, mode, timetable, next or last run and state")

Or, on a pipeline's own page, choose **Run now** at the top. If the pipeline has unsaved changes the button reads
**Save & run now** and saves them first; if several schedules run it, it asks which; if none does, it gives the pipeline
an on-demand schedule (it runs only when started) and runs it.

> **Note:** **Run now** is not offered for an inactive schedule ("Activate this schedule to run it") or while the
> schedule already has a run queued or running.

## Give one run its own values: Run with…

**Run with…** is in the **⋮** menu when the pipeline declares run parameters. When its only choice is a model, it reads
**Run with a different AI model…**.

1. Open the schedule's **⋮** menu and choose **Run with…**.
2. Under **Parameters**, each parameter shows its default and the placeholder steps read it by (`{{param.from}}`).
   Change the values for this run. Dates are picked from a calendar; a choice from its list.
3. Under **AI models**, choose the model each AI step runs on, if you want another one for this run.
4. Choose **Run**.

The values are for this run only: the schedule keeps its own settings, and the next scheduled run is not changed. A value
is checked before the run starts (a date as 2026-10-01, a number, one of the choices); a blank value takes the default.

![Run with… on a schedule with two date parameters](trg-run-with "Run with…: this run's From and To dates; the schedule keeps its own")

## Run several schedules at once

1. Tick the schedules in the list (the box in the header ticks every schedule on the page).
2. Choose **Run selected** in the bar that appears, and confirm.

A schedule already queued or running cannot be ticked.

## Example

Greta Fischer, Summit Valley's health information lead, needs the consent forms signed in September. She opens the schedule **Consent forms by date
range**, chooses **Run with…**, sets **From** to 1 Sep 2026 and **To** to 30 Sep 2026, and presses **Run**. The run
counts the consent forms per procedure for September only; the schedule's defaults (October to December) are unchanged.

## Limits

| What | Limit |
|---|---|
| Run now while the schedule has a run queued or running | Not offered (files and documents that arrive meanwhile wait their turn) |
| A text value | 500 characters on one line |
| Who | Anyone whose page access includes Schedules & triggers; a member sees and runs their own schedules |
