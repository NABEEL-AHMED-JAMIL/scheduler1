---
id: apr-two-party
title: Two-party review: your team, then your customer
summary: A run's results that both your team and your customer (through the API) must approve; how the two decisions combine.
section: Review
who: Workspace administrators turn it on and decide your team's part; the customer decides theirs through the API
where: Build › Pipelines (/pipelines/list); Run & review › Review › Runs (/review/runs)
related: apr-run-review, apr-bulk, run-page
---
Some results are checked twice: by your own team, and by the organisation you work for, from its own portal. A partner lab's
results, a payer's claim file or a referral answered for another hospital can need both. A pipeline can ask for both
reviews; the run's results count only when both have approved.

![A pipeline's Review settings](apr-review-settings "A pipeline's Settings › Review: Results need review by Our team and The customer (through the API), and individual review")

## Turn it on
1. Open the pipeline under **Build › Pipelines** and go to **Settings**.
2. Under **Review**, in **Results need review by**, tick **Our team** and **The customer (through the API)**.
3. Save. Each run's results now start as waiting for review.

## How the two decisions combine
| Your team | The customer | The run's results |
|---|---|---|
| Not decided | Not decided | Waiting for review |
| Approved | Not decided | Still waiting, for the customer |
| Approved | Approved | **Approved** |
| Rejected | (either) | **Rejected**: the other side need not decide |
| (either) | Rejected | **Rejected** |

- **Your team** decides in the console, like any run review: in **Review**, or on the run's page under **Next steps**
  ([Review a run's results](#apr-run-review)). A workspace administrator records it.
- **The customer** decides through the customer API, from its own systems, with a client allowed to write reviews. The
  console cannot record the customer's decision, and the customer cannot record yours.
- Each side decides once. Either order works; in practice your team checks first.
- A run started through the API can be run again on the customer's rejection, with the same input.

> **Note:** The customer's part is never decided in bulk. Your team's part can be, under the workspace's bulk review rules
> (see [Decide many at once](#apr-bulk)).

## Example
A partner's portal starts *Partner answers the customer review* through the API with a batch of results. Dr. Anika
Patel approves the internal review in Summit Valley's **Review**; the partner's system then sends its own approval, and the
run's results read **approved**, with both decisions in its review.

## Limits
| What | Limit |
|---|---|
| Who records your team's decision | A workspace administrator (or a reviewer through their task) |
| Who records the customer's decision | The customer, through the API only |
| Decisions | One per side; final once the results are approved or rejected |
