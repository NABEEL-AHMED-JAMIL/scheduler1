---
title: Troubleshooting and FAQ
chapter: 19
part: Part VIII · Reference
icon: alert
blurb: What a message means and how to fix it, and the questions people ask most.
paths: 
sections: By message | Questions
---
When something does not work, the console says what and where: a failed step with its message, a skipped item with
its reason, a report that was not made with what to do. This topic is organised by those messages, each with its cause
and its fix, and ends with the questions people ask most.

## Start here
1. [When a run or a step fails](#ts-runs) — Read the failure, then retry from the failed step. ![](ts-failed-runs)
2. [Files and media](#ts-files) — Photos, conversions and recordings that cannot be read. ![](ts-photo)
3. [Connections and APIs](#ts-connections) — Calls refused up front, by the other system, or by a contract. ![](ts-too-many-calls)
4. [Documents, contracts and reports](#ts-documents) — Contracts, duplicates, page limits and missing pictures. ![](ts-contract)
5. [Approvals](#ts-approvals) — Rejected, expired, overdue, or skipped in bulk. ![](ts-rejected)
6. [Frequently asked questions](#ts-faq) — About thirty short answers.

## Questions
### Where do I see why a run failed?
On the run's page: the failed step is marked red with its message, and **Runs › Failed** groups the same error across
runs. See [When a run or a step fails](#ts-runs--read-a-failure).

### Will a retry run every step again?
No. **Retry from step N** reuses what the earlier steps kept; **Run again from the start** runs them all. See
[Retry](#ts-runs--retry).

### "No object at …": what is missing?
The file the step reads is not in the bucket, or not under that name. See
[A missing file](#ts-runs--a-missing-file-no-object-at).

### Why did Call API fail before calling anything?
The input needed more calls than the step's **At most calls** allows, so nothing was sent or billed. See
[Connections and APIs](#ts-connections).

### Why was my report not made?
It was over the workspace's page limit, or a field it needs was missing. See
[Documents, contracts and reports](#ts-documents--a-report-over-the-page-limit).

### Why can't I see the Billing menu?
Billing is for workspace administrators. See [Frequently asked questions](#ts-faq--access-and-the-menu).

## Related
- runs
- approvals
- steps
- glossary
