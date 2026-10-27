---
id: run-at-once
title: Runs at once and big data
summary: One run of a schedule at a time, workflow requests in parallel, backfills a few at a time, calls at once, and large files.
section: Follow runs
who: Workspace administrators set schedules, backfills and step settings; anyone who may read the runs follows them
where: Run & review › Runs (/runs/latest); Run & review › Runs › Backfills (/runs/backfills)
related: run-runs, run-failures, run-page, ai-steps
---
Several pipelines can run at the same time, and one pipeline can work on a very large file. A few rules keep that safe and
predictable: a schedule never runs over itself, calls to a model or another service are capped, and a step that would
need too much says so before it starts.

## One run of a schedule at a time
A schedule starts a new run only when its last run has finished. A **Run now** or a trigger that comes while a run is
still queued, starting or running is refused with the reason: *A job can't be run while its last run is still in flight*.
A timetable slot that comes while the last run is still working is recorded as **Skipped**, so nothing is lost silently.

The exception is an approval workflow: requests that each run the same pipeline (one patient's journey and another's, say)
run side by side, each its own run.

## Backfills, a few at a time
A backfill runs a schedule once for each day of a past range, with as many at once as you set when you start it (*3 at
once*). **Runs › Backfills** shows each one's progress, and its failed days are retried from there.

## Calls at once
A step that calls something for every row (an AI prompt, a transcription, an API call, a report per row) asks one after
another unless its **Calls at once** says more. The workspace's calls together are capped too, so one busy pipeline does
not hold up the others, and a busy service is backed off. See [AI in pipelines](#ai-steps).

## Big files
- Ordinary steps (read, check, transform, join, aggregate, save) work through files of hundreds of thousands or millions
  of rows. The run's **Steps** tab shows **Rows in → out** for each step, so you can see where rows were dropped.
- A step that calls a model or a service row by row has an **At most rows** (or **At most calls**) setting. An input
  larger than that fails before any call is made, with a message that says to filter, batch, or call once.
- A failure because of size shows the error kind *Too large for memory or a limit* on **Runs › Failed**.

![A run over a large file](run-big "A run's Steps: rows in and out of each step of a large daily file")

> **Tip:** Filter and aggregate first, and call a model only on what is left: Summit Valley's daily appointment file has
> about 110,000 rows, but only tomorrow's 240 appointments are sent on, one call each.

## Example
Summit Valley's *Four runs at once* starts four ward reports together. The first starts; the others, of the same schedule,
are refused while it is in flight and are started again in turn, so the four complete one after another. Ten patients'
journeys, by contrast, run side by side, because each is its own workflow request.

## Limits
| What | Limit |
|---|---|
| Runs of one schedule at a time | One (requests of an approval workflow excepted) |
| Calls at once in one step | 8 |
| At most rows of an AI prompt step | 500 |
