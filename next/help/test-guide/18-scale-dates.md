---
id: qa-scale
title: "Test area 18: scale, times and dates"
summary: Times on the 24-hour clock in your own time zone, Chicago schedule times, billing days, date ranges, big files, the caps on calls and rows, and runs side by side.
section: Across the product
who: Testers; as the administrator (A), with a second device or browser set to another time zone
where: Run & review › Runs (/runs/latest); Build › Pipelines › Schedules & triggers (/pipelines/schedules); Billing › Cost & usage (/billing/usage); Analysis › Analytics Studio (/data/analytics)
related: gs-tour, adm-workspace, trg-schedules, trg-backfills, run-at-once, dash-studio, bill-usage, qa-guide
---
These checks run across the product. Times: the console shows every time on the 24-hour clock in your own device's
time zone, schedules are set in server time (Chicago), and billing days follow the workspace's billing time zone. Scale:
ordinary steps work through files of millions of rows, while a step that calls a model or a service row by row has a cap
it checks before the first call.

**Before you start:** a second browser (or device) whose time zone is set to another one than yours, for example
Europe/London. A large synthetic CSV, such as a file of 1,000,000 made-up orders with `order_id`, `region`, `category`,
`amount` and `status` (the Recipes chapter shows how to make one; keep it in a test bucket).

Tested by ______ on ______

## Times and dates
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-18.01 | The 24-hour clock | Look at any list of runs and at **Review**'s **Waiting since** | Times read like 14:05, never 2:05 PM; recent ones like "21 min ago" or "26 Oct, 19:27" | ☐ Pass ☐ Fail |
| QA-18.02 | Your own time zone | Open the same run in both browsers | Its start time differs by the zones' difference: each shows its own device's time | ☐ Pass ☐ Fail |
| QA-18.03 | Schedules are in Chicago time | **New schedule**, **Daily** at 06:00; read **Next runs** in both browsers | The editor and **Next runs** say the times are server time (Chicago) | ☐ Pass ☐ Fail |
| QA-18.04 | A run's date | A run with a file named `{{date}}` ([QA-07.12](#qa-pipelines)) started just after midnight in your zone but before midnight in Chicago (or the other way) | The file carries the Chicago date | ☐ Pass ☐ Fail |
| QA-18.05 | Billing days | **Cost & usage** in both browsers | Both show the same **Days in** zone (America/Chicago unless set otherwise) and the same day totals | ☐ Pass ☐ Fail |
| QA-18.06 | Backfill days | **Backfill…**, **Dates** a range, **One run per** **Day** | The preview says the days are counted in the billing time zone, and lists each date once | ☐ Pass ☐ Fail |
| QA-18.07 | A custom date range | **Runs › By date** › **Custom**, and a dashboard's **Custom** **From** and **To** | Only runs, or rows, inside the range are shown; the range stays when you come back to the board | ☐ Pass ☐ Fail |
| QA-18.08 | A date as a run parameter | **Run with…** on a schedule with a **Date** parameter: type `2026-13-01` | Refused before the run starts: a date reads like 2026-10-01 | ☐ Pass ☐ Fail |
| QA-18.09 | Times through the API | Read a run through the API ([QA-14.13](#qa-developers)) | Its times are in UTC | ☐ Pass ☐ Fail |

## Big data
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-18.10 | A file of a million rows | A pipeline: **Read CSV/JSON/Parquet** of the large file, **Filter** `status` **eq** `paid`, **Aggregate** by `region` and `category` (**sum** of `amount`), **Save File**; **Run now** | The run completes; **Rows in → out** shows 1,000,000 read and one row per region and category kept | ☐ Pass ☐ Fail |
| QA-18.11 | The table viewer stops at 500 | **Outputs** › **View** on a step output of more than 500 rows | It draws 500 rows and says the rest are in the download | ☐ Pass ☐ Fail |
| QA-18.12 | Analytics Studio reads it in place | **Analytics Studio**, open the large file | Its rows, columns and size show; a page of rows opens quickly; nothing is copied | ☐ Pass ☐ Fail |
| QA-18.13 | A result at the row ceiling says so | **SQL**: `select * from dataset`; **Run** | The result says when it stopped at the server's row ceiling; a download of it says it holds only that part | ☐ Pass ☐ Fail |
| QA-18.14 | A model is never sent a million rows | Put an **AI prompt** step straight after the read, **At most rows** at its default | The step fails before any call: the input has more rows than its **At most rows** (50 by default, 500 at most) | ☐ Pass ☐ Fail |
| QA-18.15 | Calls at once are capped | Set an AI or **Call API** step's **Calls at once** to `9` | Not accepted: at most 8 | ☐ Pass ☐ Fail |
| QA-18.16 | A size failure has its own kind | After a run fails for size, open **Runs › Failed** | Its **Kind** reads *Too large for memory or a limit* | ☐ Pass ☐ Fail |

## Many at once
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-18.17 | One run of a schedule at a time | **Run now** on a schedule twice while the first run works ([QA-08.08](#qa-triggers)) | The second is refused, or recorded as **Skipped**; never two runs of one schedule at once | ☐ Pass ☐ Fail |
| QA-18.18 | Different schedules run together | **Run selected** on three different schedules | All three run at the same time | ☐ Pass ☐ Fail |
| QA-18.19 | Workflow requests run side by side | Start two requests of a workflow whose step runs the same pipeline | Each request gets its own run, side by side (not yet verified end to end) | ☐ Pass ☐ Fail |
| QA-18.20 | Bulk decisions stop at 100 | **Review**, **Select all matching** with more than 100 items | At most 100 go into one decision | ☐ Pass ☐ Fail |
| QA-18.21 | Bulk retry stops at 100 | **Runs › Failed**, select more than 100 failed runs (if you have them) | At most 100 are retried in one go | ☐ Pass ☐ Fail |
| QA-18.22 | A zip of items stops at 200 | A run with more than 200 items: select all, **Download zip** | At most 200 items in one zip | ☐ Pass ☐ Fail |

## Example
At Summit Valley **1M orders: streaming totals** reads 1,000,000 orders, keeps 965,517 that pass, and saves 30
region-and-category rows and 198,414 customers. The daily appointment file has about 110,000 rows, but only tomorrow's
240 appointments are sent on, one call each.
