---
id: tour-ward
title: Every day on the ward
summary: A schedule reads each day's vitals, a backfill catches up the days already past, and a reading that crosses its threshold raises a notice and a webhook.
section: Care
who: Schedules are a workspace administrator's to make; anyone whose page access includes Runs follows them
where: Build › Pipelines › Schedules & triggers (/pipelines/schedules); Run & review › Runs › Backfills (/runs/backfills)
related: tour-care-plan, tour-discharge
---
Not everything in a patient's stay waits for a request. Some work is the same every morning, and a schedule does it.
(Fictional patient, synthetic data.)

## What is set up
**Journey 11 · Daily progress and threshold alerts** has a schedule, **Daily at 07:00**. Each morning its run:

1. Reads only the vitals files written since the schedule's last completed run, so a file is never counted twice.
2. Adds them to the progress kept so far, sorts by patient and time, and keeps one reading per patient and time.
3. Works out each reading's change from the day before and whether it crossed its threshold.
4. Keeps only the crossed readings and, when there are any, sends a notice to the ward's nurses and the rows to the
   bedside alert system by a signed webhook.

## Catching up with a backfill
Elena had been on the ward for some days before the schedule was switched on. A **backfill** runs the schedule once for
each day of a past range, so the progress file holds the whole stay. **Run & review › Runs ›
Backfills** shows each backfill's days and how each went; a day that failed is retried from the backfill, not from the
run.

![Journey 11's runs](tour-ward "The daily schedule's runs and the backfill of the admission days")

## Where to see it
- **Build › Pipelines › Schedules & triggers**: the schedule, when it runs next, and **Backfill...**.
- The schedule's runs, one a day, and their **Items**.
- The bell: the notice for a crossed threshold.

## Learn more
See [Run a pipeline on a timetable](#trg-schedules), [Backfills](#trg-backfills) and [Webhooks](#dev-webhooks). Next:
[discharge](#tour-discharge).
