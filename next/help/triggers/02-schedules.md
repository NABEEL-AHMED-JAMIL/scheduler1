---
id: trg-schedules
title: Run a pipeline on a timetable
summary: Every few minutes, hourly, daily, weekly, monthly or by a cron line; the start time; pausing, skipping and the emails.
section: Run and schedule
who: Anyone whose page access includes Schedules & triggers; in a workspace our team manages, schedules are read-only to you
where: Build › Pipelines › Schedules & triggers › New schedule (/pipelines/schedules/new)
related: trg-run-now, trg-file, trg-backfills, pl-placeholders
popular: Run a pipeline every morning
aliases: run
---
A **schedule** runs one pipeline: on a timetable, only when started, and also when a file arrives or a document is
approved. The editor reads as three questions: **What runs**, **When it runs** and **Email me when**. Beside it, **What
you will get** says the schedule in a sentence and lists its next runs.

![A daily schedule in the editor](trg-schedule "A schedule: what runs, when it runs, who is emailed, and the next runs worked out")

## Make a schedule

1. Open **Build › Pipelines › Schedules & triggers** and choose **New schedule** (or **Schedule** on a pipeline's page).
2. Under **What runs**, give a **Schedule name** and choose the **Pipeline**. **Open the pipeline** goes to it.
3. Under **When it runs**, choose **On a timetable** (by itself) or **Only when started** (from **Run now**, or when a
   workflow starts it).
4. For a timetable, choose **How often** and fill in the sentence (see below). Optionally set **Ends**: it still runs on
   that day.
5. Under **Also starts when**, tick **A file arrives** or **A document is approved** if it should also start on those
   (see [When a file arrives](#trg-file) and [When a document is approved](#trg-document)).
6. Under **Email me when**, tick **A run completes**, **A run fails** and/or **A run is skipped**.
7. Leave the switch at the foot on **Active: runs as soon as it is saved**, or turn it off to save it without runs.
8. Choose **Create schedule** (or **Save changes**).

Check **Next runs** on the right before you save: it is worked out by the scheduler itself.

## How often: the frequencies

| How often | The sentence | Example |
|---|---|---|
| **Minutes** | Every N minutes from a time, starting a day | Every 15 minutes from 00:00 |
| **Hourly** | Every N hours from a time, starting a day | Every 1 hour from 00:05 |
| **Daily** | Every N days at a time, starting a day | Every 1 day at 06:00 |
| **Weekly** | Every N weeks at a time, **On these days** | Every 1 week at 06:00 on Mon |
| **Monthly** | Every N months on a day (or the start date's day) at a time | Every 1 month on day 2 at 05:00 |
| **Advanced (cron)** | A cron line, with an optional **Not before** day | `30 8 * * 1-5` |

Times use the 24-hour clock.

> **Note:** Schedule times are server time (Chicago), as the editor and **Next runs** say. A workspace in another time
> zone sets the Chicago time that matches its own.

## Use a cron line

Choose **Advanced (cron)** and type the **Cron expression**: minute, hour, day of month, month and day of week, in
server time (Chicago). The examples under the box fill it in.

```A cron line: 08:30 on weekdays
30 8 * * 1-5
```

```A cron line: every 15 minutes
*/15 * * * *
```

![The cron settings of a schedule](trg-cron "Advanced (cron): the expression, its examples, Ends and Not before")

## Pause, skip or stop a schedule

From the schedule's **⋮** menu on the list:

- **Deactivate** stops it running. Slots that pass while it is off are recorded as **Missed**, not replayed when you
  turn it back on with **Activate**.
- **Skip next run** asks first, naming the run, then skips that one run (recorded as **Skipped**); later runs stay on
  schedule.
- **Email notifications** changes who is emailed.
- **Duplicate** copies the schedule; **Delete** removes it (its run history is kept).

Switching a schedule to **Only when started** keeps its timetable, paused: switching back resumes it.

## Retries and priority

Open **Advanced** in the editor:

- **Priority**: 1 to 9, 1 is highest.
- **Attempts**: 1 to 10; 1 means no retry. With more, **Retry after** (1 to 3,600 seconds) doubles each attempt, up to
  an hour.

## Example

Summit Valley's **Bed occupancy by ward** runs **On a timetable**, **Daily**, every 1 day at 06:00, so the bed board
is ready when the morning shift starts. Its **ADT feed** runs **Hourly** from 00:05, and **Patient statements** runs **Monthly** on
day 2.

## Limits

| What | Limit |
|---|---|
| Priority | 1 to 9 |
| Attempts | 1 to 10 |
| Retry after | 1 to 3,600 seconds, doubling |
| Next runs shown | The next five |
