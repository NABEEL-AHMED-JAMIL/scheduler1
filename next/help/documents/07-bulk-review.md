---
id: doc-bulk-review
title: Review many documents at once
summary: Approve or reject up to 100 documents in one decision, and the workspace's review policy that allows it.
section: Read and review
who: Anyone whose page access includes Review › Documents decides in bulk; workspace administrators set the review policy
where: Review › Documents (/review/documents); Administration › Data policies (/administration/data-policies)
related: doc-review, doc-checks
---
When many documents wait and they are alike (a batch of clean receipts, say), deciding them one by one is slow. Tick
them in the queue and decide them together. Each document is still decided and recorded on its own, and the console
first shows you what would happen.

## Decide several together
1. Open **Review › Documents** and filter the list to what you want to decide, for example one type and **Not
   claimed**.
2. Tick the documents, or tick the box in the header to take every one on the page that can be decided. **Select all
   matching** takes up to the first 100 that match the filters.
3. The bar at the foot says how many are selected, with **Reject**, **Approve** and **Clear**.
4. Choose **Approve** or **Reject**. A panel opens and checks what would happen: how many would be decided, grouped by
   document type, which will be skipped and why, and any that could not be checked.
5. Add a comment. It is applied to each document, and required to reject.
6. Above 25 documents, type the number back to confirm.
7. Choose the button, which says what it does: **Approve 12**. The panel then lists each document as decided, skipped or
   failed, each with a link. Choose **Done**.

![Two documents selected in the review queue](doc-bulk "Bulk review: the selected documents, and Reject, Approve and Clear at the foot")

**What is skipped:** a document someone else has claimed (theirs to decide), one already decided, and, unless the policy
includes them, one whose rules fail.

## The review policy (administrators)
Whether documents may be approved in bulk at all is the workspace's choice.

1. Open **Administration › Data policies**.
2. Under **Bulk review**:
   - **Allow bulk approve of documents**: off, documents are approved one by one.
   - **Include documents whose rules fail**: off (the default), a document with a failing rule is skipped and approved
     on its own screen. On, the failures are accepted, and the override is recorded on each document.
   - **Allow bulk approve of runs** is the same choice for pipeline runs that wait for review.
3. Choose **Save review policy**.

Rejecting in bulk is always allowed.

![The Bulk review policy](doc-review-policy "Administration › Data policies › Bulk review: runs, documents, and documents whose rules fail")

> **Warning:** A bulk approval is your decision on every document in it. Filter to the documents you have really looked
> at, and keep **Include documents whose rules fail** off unless your process says otherwise.

## Example
Summit Valley allows bulk approval of documents but not of documents whose rules fail. At month end Claire Martin
filters **Review › Documents** to **Receipt** and **Not claimed**, checks the values of the 40 listed, ticks them all,
types `40` to confirm and approves them with the comment "Checked against the card statement"; two receipts with a failing
duplicate rule are skipped, and she opens each on its own.

## Limits
| What | Limit |
|---|---|
| Documents in one decision | 100 |
| Typing the count back | Above 25 |
| Comment | Up to 500 characters; required to reject |
