---
id: run-items
title: The Items view
summary: One item per file, document, recording or row; sub-items; an item's data and files; text read beside the page image; acting on many at once.
section: Items and outputs
who: Anyone who may read the run; retrying items and Send to review are for those who may open the schedule
where: Run & review › Runs (/runs/latest)
related: run-page, run-schedule-items, run-failures, ai-transcription
popular: Open one item of a run
---
A pipeline that works **item by item** (each photo, document, recording or patient) keeps a record for every item: how it
went at each step, its data and its files. The run's **Items** tab lists them, so you can find the one that failed, see
why, and retry only that one.

![The Items tab of a run](run-items "A run's Items tab: the summary, the filters and search, and one row per item with a column per step")

## Read the list
- The **summary** at the top: how many **Items** the first step found, how many are **Done** and **Failed**, the
  **Duration** (about how long an item took) and the **Files made**.
- The filters **All**, **Done**, **Failed** and **Running**, each with its count, and **Check by hand** when a step that
  reads text from pages marked pages it was unsure of.
- **Search an item, or a value like risk = High**: an item's name, or a value of any field.
- One row per item: its name and folder, its status (*Done*, or *Failed at* the step), and a column per step with
  **View** for that step's data. **Columns** chooses the fields shown; **Download CSV** takes the list.
- A row with **sub-items** (a document's pages, for example) opens them with **Show the pages of** the item.

> **Privacy:** A value the Data Catalog holds as sensitive shows as **Masked for you** unless your access lets you read it.

## Open one item
1. Choose **Open** on the item's row.
2. The panel shows the item's **Steps for this item**: each step's status and time, **Why it failed** for a failed item,
   and **Data at each step** (**View the data at** a step, **Copy** it).
3. **Files for this item** lists what each step kept for it, such as the page images, with **View** and **Download**.
4. For a scanned page, **Page image beside the text read** shows the page and the text the step read side by side, and how
   sure it was.
5. **Previous item** and **Next item** move through the list; **All runs of this item** finds the item in the schedule's
   other runs; **Retry this item** runs a failed item again from the step it failed at.

![One item open](run-item-panel "An item's panel: its steps, its data at each step and the files kept for it")

**Earlier versions** lists the item's attempts (*Attempt 2 · Done · current*, *Attempt 1 · Failed · earlier*) when it was
retried.

Some steps are made once for the whole run (a report of all rows, say): they show **Made once for the run**. A step that
did not run for an item because an earlier one failed shows **Not run: an earlier step failed**.

## Act on many items at once
1. Tick the items, or tick the page and choose **Select all N matching** to take every item the filter and search find,
   on every page.
2. The bar at the foot of the list offers:
   - **Retry N failed**: only the failed ones of the selection, each from the step it failed at;
   - **Download zip**: each item's files in a folder of its own;
   - **Export CSV**: the selected rows;
   - **Send to review**: ask **A team** or **A role** to check them, with **What to check**; they get one task in
     **Review › Approvals**.
3. **Clear the selection** with the close button.

![Items selected, with the bar](run-items-selected "Three failed items selected: Retry failed, Download zip, Export CSV and Send to review")

> **Tip:** **Retry failed items** above the list retries every failed item at once. The steps before are reused, not run
> again, and the items that are done are left as they are; a report already made for an item is kept.

## Sensitive pipelines
A pipeline marked sensitive in its settings has a person's details masked for anyone the data policy masks them for
(names, emails, phone numbers, ids, addresses): in every item's values, its data at each step, the compare, the CSV,
the zip's `item.json` and the run's outputs, from its very first row. An item's name stays visible (its file name, or
the id column that names it, such as a record or patient id), so you can still find it and tell items apart.

The files such a pipeline keeps (a saved file, an item's files, a report's PDF) are its real output and are not masked:
viewing, previewing or downloading them needs the **Download sensitive files** permission on the person's access
profile (**Administration › Page access**). Without it you see each file's name, size and type, and a lock in place of
**Download**. Workspace administrators always have it.

## Example
Daniel Kim drops four wound photos; one is too dark to measure. The run's **Items** shows *4 items, 3 done, 1 failed at
Measure*. Sam Harper opens the failed item, reads **Why it failed**, has the photo taken again, and chooses **Retry this
item**: only that photo is measured again.

## Limits
| What | Limit |
|---|---|
| Items in one zip | 200 |
| Rows per page | You choose the page size at the foot of the list |
