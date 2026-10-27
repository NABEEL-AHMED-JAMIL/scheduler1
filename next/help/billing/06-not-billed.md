---
id: bill-not-billed
title: What is not billed
summary: The sandbox, retries that reuse what was done, refused API calls, tokens and signed links, and work that was never done.
section: Usage
who: Workspace administrators
where: Administration & billing › Billing › Cost & usage (/billing/usage)
related: bill-usage, bill-cost, dev-sandbox
---
Usage is billed for work the platform actually did for your workspace. Some things look like work but are not billed,
or are not billed twice. This list helps when a bill is lower than expected, or when you plan how to test.

## Never billed
| What | Why |
|---|---|
| Everything in your **sandbox** | Test keys work only in the sandbox, and a sandbox is never billed. Its **Cost & usage** prices the usage to show what it would cost, marked **Sandbox · never billed**, but it is never drafted or invoiced. |
| An API call refused for a limit | Past a rate limit or the monthly quota the API answers *429*: nothing was done, and nothing is billed. |
| Getting a token | The token call is not counted as an API call. |
| Reading through a signed link | Downloading a file, or a run view reading its run, through a signed link is not counted as an API call. |
| A webhook delivery that never arrived | Only deliveries that reach your receiver are billed. |

## Not billed twice
| What | Why |
|---|---|
| Retrying a run from the failed step | The steps before it are not run again: their kept outputs are reused, and not billed again. |
| Retrying failed items | Only the retried items run again; the others are neither called nor billed again. |
| A report a retry did not need to remake | A report already made for the same row, design and settings is reused, not made or billed again. |
| Sending the same API request twice | With the same Idempotency-Key, the second answer is the first result; nothing new is done. |

> **Note:** **Run again from the start** runs every step again, and every step is billed again. Prefer **Retry from the
> failed step** when the earlier steps' outputs are still good.

## Billed, though it may look free
- **The console's own reads** of your files (opening a file, a dashboard's widgets) are billed as storage reads and
  analytics queries, like any other read.
- **Deleting data** is billed as data churn (**Bytes deleted (data churn)**) and storage deletes.
- **Storage kept** is measured every night, whether or not anything ran.

## Example
Before going live, Summit Valley Health System's developers ran the partner portal's calls in the sandbox for a week.
**Cost & usage** for the real workspace did not move. When a run of *Denials by month* failed at its last step and was
retried from that step, only that step's work appeared again on the month's lines.
