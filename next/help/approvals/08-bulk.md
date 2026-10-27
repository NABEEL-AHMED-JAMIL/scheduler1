---
id: apr-bulk
title: Decide many at once
summary: Approve or reject several runs, tasks or documents in one deliberate step; what is checked first, what is skipped and why, and the workspace's rules.
section: Review
who: Anyone who may decide the items; whether runs and documents may be approved in bulk is a workspace administrator's choice
where: Run & review › Review (/review/all); Administration & billing › Administration › Data policies (/administration/data-policies)
related: apr-review-home, apr-run-review, apr-approval-steps, run-failures
popular: Approve or reject several items at once
---
When many items wait for the same decision (a morning's lab results, a batch of invoices that all matched), decide them
together. Each item is still decided on its own, by exactly the rules of a single decision, and recorded on its own with
your name; the console only gathers them, shows you first what will happen, and reports item by item.

![Two documents selected in Review](apr-review-selected "Review › All waiting with two documents ticked: the bar offers Reject and Approve")

## Decide several at once
1. Open **Run & review › Review** (**All waiting**, or one kind's tab).
2. Tick the items, or tick the header to **Select everything shown that you may decide**. With a full page ticked, the bar
   offers to select every match, not just this page.
3. Choose **Approve** or **Reject** in the bar.
4. The panel first checks each item and lists what will be done, **By** source, and what **Will be skipped**, each with
   its reason.
5. Add a **Comment**: one comment is applied to each item. It is required to reject (*Say why these are rejected*) and
   optional to approve.
6. Above 25 items, **Type N to confirm**: say how many, so a decision this wide is never one click.
7. Confirm. The answer lists every item: done, skipped with its reason, or failed with its message.

> **Tip:** If sending fails, **Try again** sends the same decision: an item already recorded is not recorded twice.

## Why an item is skipped
| Reason | What to do |
|---|---|
| *Already decided* | Nothing: someone decided it first |
| *Not yours to decide* | It waits for someone else |
| *The pipeline requires individual review* | Open it and decide it on its own |
| *Bulk approve is off in this workspace* | Approve it one by one, or ask an administrator |
| *The run is not completed (failed, or still running)* | Only a completed run's results can be approved |
| *Cannot be approved as it stands* | A document with a failing rule: open it and correct it |
| *Changed since it was listed* | Refresh and look again |
| *Not an approval* | A task step: open it to do it |

## The workspace's rules
Under **Administration & billing › Administration › Data policies › Bulk review**, a workspace administrator chooses:
- **Allow bulk approve of runs**: off, runs are approved one by one on their page or in Review;
- **Allow bulk approve of documents**, and **Include documents whose rules fail** (off by default: a document with a failing
  rule is skipped and approved on its own screen; on, the failures are accepted and the override is recorded on each).

Documents have their own bulk screen too: [Review many documents at once](#doc-bulk-review). Rejecting in bulk is
always allowed. A pipeline can require individual review in its **Settings**, which keeps its runs and
its Approval steps out of every bulk decision. A customer's decision in a two-party review is never taken in bulk.

## Retry several failed runs
**Runs › Failed** uses the same bar to retry several failed runs from their failed steps: see
[When something fails](#run-failures).

## Example
At 08:00 Claire Martin has 18 supplier invoices that matched their purchase orders waiting in **Review › Documents**. She
ticks them, chooses **Approve**, reads that 17 will be approved and one skipped (*Cannot be approved as it stands*: a total
that does not add up), adds *Matched to PO, checked by CM*, and confirms. She opens the skipped one on its own.

## Limits
| What | Limit |
|---|---|
| Items in one bulk decision | 100 |
| Typed confirmation | Above 25 items |
| Comment | 500 characters, applied to each item |
