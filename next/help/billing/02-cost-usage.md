---
id: bill-cost
title: Read Cost & usage
summary: The month so far and its forecast, cost by day and by service, every line and what is behind it, cost by pipeline and by run, AI model calls, and the trends over months.
section: Usage
who: Workspace administrators
where: Administration & billing › Billing › Cost & usage (/billing/usage); Administration & billing › Billing › Analytics (/billing/analytics)
related: bill-usage, bill-invoices, bill-estimates, bill-not-billed
popular: See what a pipeline costs
---
**Cost & usage** shows what the workspace used this month and what it costs: the same lines the invoice will carry.
Usage is rolled up every few minutes, so it follows the runs as they finish.

## The top of the page
1. Open **Administration & billing › Billing › Cost & usage**.
2. Pick the month with the arrows beside it (**Previous month**, **Next month**). **Export CSV** saves the lines.
3. The chips say what prices the month: **Priced with** the rate card and version, the currency, **Day** so far of the
   month, **Yesterday**'s cost, and **Days in** your billing time zone.
4. The four figures: **Month to date** (with a forecast at the last week's pace, and last month's total), **Data
   deleted** (with the delete operations and their churn), **Storage kept** (the average of the nights measured) and
   **Seats**.

![Cost & usage](bill-cost "Cost & usage: the rate card and time zone, the month so far, Cost by day and By service")

## By day and by service
- **Cost by day** draws each day's cost by service, before the month's allowances and tiers. Switch between **Daily**
  and **Cumulative**; the dotted **Forecast pace** shows where the month is heading. **Click a day for its lines.**
- **By service** adds the month up by service, then shows **Days added up, before allowances**, **Allowances and
  tiers**, and **Month to date, as the invoice lists it**.

## Line by line
**Line by line** lists each meter with its **Service**, **Quantity**, **Rate** and **Amount**. Lines under a cent are
folded away; **Show N lines under a cent** opens them. Choose a line to see what is behind it: which bucket, which
prompt, which API client, who deleted what, with the number of events and when the last was. A line priced by a
pricing rule shows that rule's part beneath it.

## Cost by pipeline and by run
**Cost by pipeline** splits the month into **From pipeline runs** and **Not tied to a run** (storage kept, analytics,
the console's reads, API calls).

1. **By pipeline** lists each pipeline with its **Runs**, **Cost**, **Per run**, **Share** of the month and what it was
   **Spent on** (for example *mostly model tokens*). **Show all** opens the rest.
2. Choose a pipeline, or its **Runs** button, to fill **By run** below with its runs.
3. **By run** lists each run, grouped by day, with when it **Started**, its **Status**, **What it cost** by meter and
   its **Cost**. Search by pipeline, schedule or run, or pick a status. **Open the run** goes to the run's page.

![Cost by pipeline](bill-pipelines "Cost by pipeline: from runs and not tied to a run, each pipeline's runs, cost and share, and By run")

## AI model calls
**AI model calls** counts the **Calls**, **Tokens in**, **Tokens out** and **Cost at model rates**, with the rates it
used:

- **By source**: what called a model, the dearest first, with its model, calls,
  pipeline runs, tokens, cost, share and last call. **By model** adds them up per model.
- **Every call**: each call with its time, what called it, its pipeline run and who.

![AI model calls](bill-model-calls "AI model calls: calls, tokens and cost at model rates, by source and by model")

## Trends over months
**Administration & billing › Billing › Analytics** shows the last 3, 6 or 12 months: the total, this month so far,
the largest service and the costliest pipeline, **Cost by month** coloured by service, and **By service** and **By
pipeline** for the period.

> **Note:** Figures on **Cost & usage** before a month closes are a running estimate of the invoice, not a bill. The
> invoice for a month is made once it is over in your billing time zone. See [Invoices](#bill-invoices).

## Example
At the start of November, Claire Martin, controller at Summit Valley Health System, opens October on **Cost & usage**:
*Model calls* is 98% of the month. **By pipeline** shows *Patient statements, one per guarantor* as the costliest, and
**AI model calls** shows the prompt behind it. She exports the lines to CSV for the finance pack.
