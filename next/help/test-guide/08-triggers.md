---
id: qa-triggers
title: "Test area 08: schedules and triggers"
summary: Timetables and cron lines, Run now and Run with…, pausing and skipping, starting on a file, a form or an approved document, one run at a time, and backfills.
section: Data in and build
who: Testers; the administrator (A), with V and X for access and isolation
where: Build › Pipelines › Schedules & triggers (/pipelines/schedules); Run & review › Runs › Backfills (/runs/backfills)
related: trg-run-now, trg-schedules, trg-file, trg-form, trg-document, trg-backfills, run-at-once, qa-pipelines
---
These checks cover everything that starts a run: a timetable, **Run now**, **Run with…** with its own values, a file in
the inbox, a form's submission, an approved document, and a backfill over past days. A schedule never runs over itself:
a start that comes while its last run is still going is refused or recorded, never lost silently.

**Before you start:** the pipeline `QA occupancy` of [QA-07](#qa-pipelines), with its run parameter `min_pct`. The file
drop set up ([QA-05.08](#qa-documents)). Two small CSV files named `qa-in-1.csv` and `other.csv`. Times on the schedule
editor are server time (Chicago) on the 24-hour clock.

Tested by ______ on ______

## Timetables
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-08.01 | Make a daily schedule | As A, **Schedules & triggers** › **New schedule**: **Schedule name** `QA daily`, **Pipeline** `QA occupancy`, **On a timetable**, **Daily**, every 1 day at 06:00 | **What you will get** says it in a sentence; **Next runs** lists the next five, each at 06:00 | ☐ Pass ☐ Fail |
| QA-08.02 | A cron line | Change **How often** to **Advanced (cron)**, **Cron expression** `30 8 * * 1-5` | **Next runs** lists only weekdays, each at 08:30 | ☐ Pass ☐ Fail |
| QA-08.03 | Save it inactive | Turn the switch at the foot off; **Create schedule** | The schedule is listed and not active; **Run now** is not offered ("Activate this schedule to run it") | ☐ Pass ☐ Fail |
| QA-08.04 | Activate and Deactivate | **⋮** › **Activate**; later **Deactivate** across a slot time | Slots that pass while it is off are recorded as **Missed** and not replayed on **Activate** (not yet verified) | ☐ Pass ☐ Fail |
| QA-08.05 | Skip the next run asks first | **⋮** › **Skip next run** | It asks first, naming the run; after confirming, that run is recorded as **Skipped** and later runs stay on time | ☐ Pass ☐ Fail |
| QA-08.06 | Retries and priority | Open **Advanced**: **Priority** `10`, then `3`; **Attempts** `11`, then `2` | 10 and 11 are refused (priority 1 to 9, attempts 1 to 10); 3 and 2 save | ☐ Pass ☐ Fail |

## Run now and Run with…
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-08.07 | Run now | **⋮** › **Run now** | The run is queued; the row's **Run status** follows it to **Completed** | ☐ Pass ☐ Fail |
| QA-08.08 | Not twice at once | Choose **Run now** and, while that run is queued or running, try again | **Run now** is not offered, or the start is refused with *A job can't be run while its last run is still in flight* | ☐ Pass ☐ Fail |
| QA-08.09 | Run with… its own values | **⋮** › **Run with…**: `min_pct` `95`; **Run** | The run keeps one ward (ICU); the schedule's default stays 80 and the next run uses it | ☐ Pass ☐ Fail |
| QA-08.10 | A bad value is refused before the run | **Run with…**: `min_pct` `high` | Refused before anything starts: the value must be a number | ☐ Pass ☐ Fail |
| QA-08.11 | Run several at once | Tick two schedules; **Run selected**; confirm | Each starts its own run; a schedule already queued or running could not be ticked | ☐ Pass ☐ Fail |

## Starting on arrival
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-08.12 | A file arrives | Open `QA daily`; **Also starts when** › **A file arrives**, **Which files** `qa-*.csv`, **Files per run** `1`; save | **What you will get** says "Also when a file arrives in the inbox matching …" | ☐ Pass ☐ Fail |
| QA-08.13 | A matching file starts a run | Drop `qa-in-1.csv` on **File drop** | A run starts; on **Runs › Latest** its **Started by** is **File arrived** | ☐ Pass ☐ Fail |
| QA-08.14 | Another file does not | Drop `other.csv` | No run starts for it | ☐ Pass ☐ Fail |
| QA-08.15 | A form starts it | Link `QA intake` to this schedule ([QA-06.16](#qa-forms)); submit the form | A run starts, **Started by** **Form submitted** | ☐ Pass ☐ Fail |
| QA-08.16 | An approved document starts it | **Also starts when** › **A document is approved**, **Which documents** **Referral**; save; approve a referral in **Review › Documents** | A run starts, **Started by** **Document approved**; **Document types** shows the schedule under **When approved, starts…** | ☐ Pass ☐ Fail |
| QA-08.17 | A rejected document starts nothing | Reject a referral | No run starts | ☐ Pass ☐ Fail |

## Backfills
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-08.18 | The preview | `QA daily`'s **⋮** › **Backfill…**: **Dates** 7 days, **One run per** **Day**, **At once** 2 | **Preview** says how many periods **will run** and are **already done, skipped**, lists each date, and (for A) shows a **Cost estimate** or says there is nothing to estimate from | ☐ Pass ☐ Fail |
| QA-08.19 | Start and follow | **Start: 7 days** | **Runs › Backfills** shows it with its range, 2 at once, a bar of done, failed and running, and its status | ☐ Pass ☐ Fail |
| QA-08.20 | Pause, resume, cancel | **Pause**, then **Resume**; start another and **Cancel** it | Each takes effect; the cancelled one is listed under **Cancelled** | ☐ Pass ☐ Fail |
| QA-08.21 | An inactive schedule cannot be backfilled | **Deactivate** `QA daily`; **Backfill…** | The preview says *The schedule is switched off; switch it on to backfill it.* | ☐ Pass ☐ Fail |

## Access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-08.22 | A viewer has no schedules | As V, go to `/pipelines/schedules` | Refused | ☐ Pass ☐ Fail |
| QA-08.23 | Another workspace's list | As X, **Schedules & triggers**, search `QA daily` | Not found | ☐ Pass ☐ Fail |
| QA-08.24 | Another workspace's file drop starts nothing here | As X, drop a file named `qa-in-2.csv` on X's own file drop | No run of A's `QA daily` starts | ☐ Pass ☐ Fail |

## Example
At Summit Valley **Denials by month (backfill a quarter)** backfilled 1 to 25 October, one run per day, three at once:
25 runs, all completed. **Four runs at once** shows the rule of one run per schedule: the first start ran, the other
three were refused while it was in flight and ran in turn.
