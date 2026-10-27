---
id: qa-billing
title: "Test area 15: billing"
summary: Cost & usage and its lines, a run's cost, what is not billed twice, backfill estimates, invoices, credit notes, statements and receipts, and who may read them.
section: Administer
who: Testers; as the administrator (A), with R, V and X for access and isolation
where: Billing › Cost & usage (/billing/usage); Billing › Invoices (/billing/invoices); Billing › Billing documents (/billing/documents); Billing › Analytics (/billing/analytics)
related: bill-usage, bill-cost, bill-estimates, bill-invoices, bill-documents, bill-not-billed, ai-costs, qa-runs
---
These checks follow the work of the earlier areas onto the bill: every run, model call, page read and file kept is
metered, priced from the workspace's rate card, and shown on **Cost & usage** as the invoice will read it. They also
check what is never billed, or not billed twice. Usage is rolled up every few minutes, so wait a little after a run
before you look for it.

**Before you start:** the runs of areas 07 to 10, including the retried run of [QA-10.11](#qa-runs). Prices come from
your account's rate card; the checks look at what is counted, not at the amounts.

Tested by ______ on ______

## Cost & usage
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-15.01 | What prices the month | As A, **Administration & billing › Billing › Cost & usage** | The chips show **Priced with** the rate card and version, the currency, **Day** so far, **Yesterday**, and **Days in** the billing time zone (America/Chicago unless set otherwise) | ☐ Pass ☐ Fail |
| QA-15.02 | The four figures | Read the top | **Month to date** (with a forecast and last month's total), **Data deleted**, **Storage kept** and **Seats** | ☐ Pass ☐ Fail |
| QA-15.03 | By service | **By service** | The month added up by **Storage**, **Model calls**, **Pipelines**, **Analytics & tools**, **API** and **Seats**, then allowances and **Month to date, as the invoice lists it** | ☐ Pass ☐ Fail |
| QA-15.04 | A line and what is behind it | **Line by line**: choose **Pipeline runs** | Its **Quantity**, **Rate** and **Amount**; choosing it shows what is behind it, with the number of events and when the last was | ☐ Pass ☐ Fail |
| QA-15.05 | A day's lines | **Cost by day**: click today | Today's lines open | ☐ Pass ☐ Fail |
| QA-15.06 | Your pipeline is there | **Cost by pipeline** › **By pipeline**: `QA occupancy`; its **Runs** | **By run** lists its runs with **Started**, **Status**, **What it cost** by meter and **Cost**; **Open the run** opens the run's page | ☐ Pass ☐ Fail |
| QA-15.07 | AI calls are counted | **AI model calls** › **By source** | The prompt `QA summary (DRAFT)` of [QA-09](#qa-ai) is listed with its calls and tokens, tries included | ☐ Pass ☐ Fail |
| QA-15.08 | Export | **Export CSV** | The file holds the month's lines as listed | ☐ Pass ☐ Fail |
| QA-15.09 | Trends | **Billing › Analytics**, 3 months | The total, this month so far, the largest service and the costliest pipeline; **Cost by month** coloured by service | ☐ Pass ☐ Fail |

## Not billed twice
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-15.10 | A retry from the failed step | **By run**: the run retried in [QA-10.11](#qa-runs) | Only the work of the retried steps is added by attempt 2; the reused steps are not billed again | ☐ Pass ☐ Fail |
| QA-15.11 | Run again from the start | Choose **Run again from the start** on a failed run; look at its cost | Every step is billed again | ☐ Pass ☐ Fail |
| QA-15.12 | A refused API call | After [QA-14.17](#qa-developers), look at **API calls** | The calls answered 429 are not counted | ☐ Pass ☐ Fail |
| QA-15.13 | The console's own reads are billed | Open a dashboard; look at **Analytics queries** and **Storage reads** later | They grow: the console's reads are billed like any other read | ☐ Pass ☐ Fail |

## Estimates, invoices and documents
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-15.14 | A backfill's estimate | **Schedules & triggers**, `QA daily`'s **⋮** › **Backfill…** | The **Cost estimate** gives the total and the average run, from the schedule's billed runs of the last 30 days, or says there is nothing to estimate from | ☐ Pass ☐ Fail |
| QA-15.15 | Estimate against billed | **Runs › Backfills**, the backfill of [QA-08.19](#qa-triggers) | Its page shows the **Estimate** it started with and **Billed so far** | ☐ Pass ☐ Fail |
| QA-15.16 | This month's invoice is a draft | **Billing › Invoices**, this month | **Draft**, reading *A running draft — rebuilt from the meter until it is issued*; its lines match **Cost & usage** | ☐ Pass ☐ Fail |
| QA-15.17 | An issued invoice | Open a past month's invoice, if there is one | **Issued** (or **Paid** or **Overdue**), its rate card version, **Period** in the billing time zone, **Lines**, **Balance**, and its PDF under **Documents** | ☐ Pass ☐ Fail |
| QA-15.18 | The billing profile | ⋯ › **Billing profile** | **Legal name**, **Address**, **Billing email**, **Tax number (VAT / GST)**, **Tax rate %**, **Currency**, **Payment terms (days)** | ☐ Pass ☐ Fail |
| QA-15.19 | A statement | **Billing documents** › **Statement 2026** | A statement is added to the list: each invoice, payment and credit note of the year, and the **Balance open** | ☐ Pass ☐ Fail |
| QA-15.20 | Check a receipt | **Verify a receipt** with a receipt's PDF (if the workspace has one) | It says whether the file is a receipt this platform issued, unchanged since it was signed | ☐ Pass ☐ Fail |

## Access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-15.21 | Billing is the administrators' | As R and as V, go to `/billing/usage` and `/billing/invoices` | Refused: billing is for workspace administrators | ☐ Pass ☐ Fail |
| QA-15.22 | Another workspace's bill | As X, **Cost & usage** › **By pipeline** | `QA occupancy` and A's runs are not there | ☐ Pass ☐ Fail |

> **Note:** Figures on **Cost & usage** before a month closes are a running estimate of the invoice, not a bill. Card
> payments are made on the payment provider's own page and are not part of this test.

## Example
At Summit Valley, one run of *Journey 7 · Wound photo* bills a **Pipeline run**, the **Model tokens in** and **out** of its
prompt, an **Image described** and **Storage writes**; its line under **By run** adds them up. A run of *Denials by
month* retried from its last step adds only that step's work again.
