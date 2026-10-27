---
id: rs-billing
title: What reports cost
summary: Which report actions are billed, how they show in Cost & usage, and what is never billed.
section: Manage
who: Workspace administrators read Billing
where: Billing › Cost & usage (/billing/usage)
related: bill-usage, bill-cost, ai-costs
---
Report Studio is billed by what it makes, on the workspace's rate card, and shows in **Billing › Cost & usage** like
everything else ([How usage is counted](#bill-usage)).

| What you do | How it is counted |
|---|---|
| Generate a report version (by hand or from a pipeline) | one **Documents converted** per version; Cost & usage names the template and the pages, and a pipeline's version counts towards that pipeline's cost |
| A job retried after a failure | billed once |
| The AI designer's proposals | AI usage (tokens) on the workspace's model connection ([What AI costs](#ai-costs)) |
| Report files kept | storage, measured nightly, like any file |
| Previews, checks, Verify signature, reading the Library | not billed |
| A job that failed and made no version | not billed |

## See what reports cost
1. Open **Billing › Cost & usage**.
2. Look for **Documents converted** under the meters; **Line by line** shows each version's line with the template's
   name.
3. For a pipeline's reports, open **Cost by pipeline** and the pipeline: its reports are part of its cost.

> **Tip:** One report per row makes one version per row, so a pipeline that makes eighteen statements a run is eighteen
> documents a run. Use **At most reports** to cap it while you try it.
