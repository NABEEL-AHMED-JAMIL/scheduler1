---
id: ts-runs
title: When a run or a step fails
summary: How to read a failure, and what to do about a missing file, a step that timed out, a busy model, a run that is still going and a quiet day.
section: By message
who: Anyone whose page access includes Runs reads failures; retrying is for whoever may run the schedule
where: Run & review › Runs › Failed (/runs/failed); Run & review › Runs › Latest (/runs/latest)
related: ts-files, ts-connections, ts-faq
popular: Find out why a run failed and retry it
---
A run that fails always says where and why. This article shows where to read that, and the fixes for the failures
people meet most often in runs and steps. The messages are quoted as the console shows them; a part in angle brackets
or a number is filled in for your run.

## Read a failure
1. Open **Run & review › Runs › Failed**. **Error patterns** groups the same error with its numbers, names and ids set
   aside, most frequent first, and names the kind of failure: **The data**, **A service it called**, **Timed out or
   stopped responding**, **Too large for memory or a limit**, **Its settings**, **Rejected by a reviewer**, **Closed by
   a person** or **Other**. Pick a pattern to list its runs.
2. Open a run. Its **Steps** tab marks the failed step in red with its message under the step's name, and says above the
   list: "Failed at step N <name>. Fix the cause, then retry: the steps before it are not run again."
3. The steps after a failed one read "Skipped: step <name> failed and its on-error is fail." Nothing is wrong with them;
   they did not run.
4. The **Log** tab has every try, for example "Try 1 of 2 failed: timed out after 5 s".

![Runs › Failed with its error patterns](ts-failed-runs "Runs › Failed: each error pattern, how often it came back and what kind of failure it is")

## Retry
- **Retry from step N** runs the run again from the failed step, as a new attempt of the same run. The steps before it
  are not run again: their kept output is reused, and the page says "Reused from attempt 1".
- **Run again from the start** runs every step again.
- A run that works item by item offers **Retry failed items** on its **Items** tab: only the failed items run again,
  each from the step it failed at.
- A run made by a backfill says "Part of backfill #N: retry failed days from the backfill." Open the backfill with
  **Open backfill #N** and retry its failed days there.

> **Tip:** Fix the cause first. A retry with nothing changed usually fails the same way, and each attempt is a run that
> is billed.

## When a retry is refused
Retrying several failed runs at once (tick them in **Runs › Failed**) shows what will happen to each first; one that
cannot be retried is skipped with its reason:

| Reason shown | What to do |
|---|---|
| The run is not failed (already retried, or running again) | Nothing: it is being dealt with |
| Another run of the pipeline is in flight | Wait for it to finish |
| The pipeline is not active | Make the pipeline active, or leave the run |
| The workspace is paused | Ask your administrator |
| The pipeline changed before the failed step: run it again from the start | Use **Run again from the start** |
| An input file changed since the run read it | Run it again from the start, so every step reads the new file |
| The kept outputs of the steps before it expired | Run it again from the start |
| Part of a backfill: retry failed days from the backfill | Open **Runs › Backfills** and retry the failed days there |

## A missing file: "No object at"
**The message:** `No object at summit-valley-s3/ops/beds/late/census-2026-10-12.csv.`

**Why:** the step reads a file that is not there: it has not arrived yet, it is in another folder, or its name is not
what the step expects (a date in the name is the usual suspect).

**Fix:** check the bucket under **See results › Analysis › Files**. When the file arrives, use **Retry from step 1**.
If the file is often late, move the schedule later, or let an arriving file start the pipeline instead (see
[Start a pipeline when a file arrives](#trg-file)).

![A run that failed on a missing file](ts-missing-file "The census file was not there: step 1 failed, steps 2 and 3 were skipped")

> **Note:** A file that is not there is not the same as nothing new. A scheduled read that finds no new files since
> the last run does not fail; see [Nothing new to do](#ts-runs--nothing-new-to-do).

## A step that timed out
**The message:** `timed out after 5 s`, on the step, and on each try in the log: `Try 2 of 2 failed: timed out after 5 s`.

**Why:** the step took longer than its **Timeout (seconds)**. A partner system that answers slowly is the usual cause.

**Fix:** open the pipeline, select the step and, under **How it runs**, raise **Timeout (seconds)** (1 to 86,400 a
try) or give it more **Tries** (1 to 10) and **Seconds between tries** (0 to 3,600). Then **Retry from step N**.

![A step that timed out on both tries](ts-timeout "A slow partner: the step allows 5 seconds and was tried twice")

## The AI service is busy
**The messages:** `Row 3: the AI service is busy (still busy after 4 tries)`, or the model's own answer such as
`Row 3: HTTP 429: …`.

**Why:** the model connection was answering other calls. The step waits and tries again by itself before it gives up,
and with **Calls at once** above 1 it also sends fewer calls at a time.

**Fix:** retry later, or lower **Calls at once** on the AI step. A workspace administrator can see what the model
connection allows under **Settings › Model connections**. When the console cannot reach the AI service at all, the
step says `The AI service could not be reached, so the step did not run.`

## A run that is still going
**The message:** `A job can't be run while its last run is still in flight ('Queue', 'Start', 'Running').`
A retry says instead: `Another run of this pipeline is still in flight; one runs at a time. Retry once it has finished.`

**Why:** one run of a schedule at a time. A scheduled run that comes due while the last one is still going is recorded
as **Skip**.

**Fix:** wait for the running one to end (**Runs › Latest** shows it), then run or retry.

## Too many rows, columns or bytes
**The messages:** `… has more than 50,000 rows, the most a step holds.`, `… has 240 columns; a step holds at most
200.`, or `… is 60,452,588 bytes; a step reads or writes at most 52,428,800.`

**Why:** a step holds at most 50,000 rows, 200 columns and 1,000,000 cells, and reads or writes a file of at most
50 MB, unless the platform set other limits for your workspace.

**Fix:** make the input smaller before it reaches the step: split the file, filter or aggregate earlier, or select only
the columns you need.

## Nothing new to do
A scheduled read of "only the files since the last run" that finds none is not a failure. The log says
`0 object(s) written since the last completed run read …`, the later steps run on no rows, and the run is
**Completed**. A step set to **Skip the rest and complete** under **If it fails** ends the run **Completed** when it
fails, with the steps after it marked skipped: "… completed; stopped after <name> failed (skip_rest), N skipped."

## Learn more
- Files, photos, recordings and conversions: [Files and media](#ts-files).
- Calls to other systems: [Connections and APIs](#ts-connections).
- The statuses: [Run statuses](#run-statuses); backfills: [Backfills](#trg-backfills).
- More questions: [Frequently asked questions](#ts-faq).
