---
title: Billing
chapter: 16
part: Part VII · Administer
icon: card
blurb: How usage is counted, Cost & usage, estimates, invoices and what is not billed.
paths: /billing
sections: Usage | Invoices
---
Everything a workspace uses is metered as it happens and priced from its rate card. Cost & usage shows the month as the
invoice will read it, down to each pipeline, run and model call; each closed month becomes an invoice with its PDF,
payments, credit notes and receipts, all kept under Billing documents.

## Start here
1. [Learn how usage is counted](#bill-usage) — Every meter in plain words, and your billing time zone. ![](bill-cost)
2. [Read Cost & usage](#bill-cost) — The month so far, by day, service, line, pipeline, run and model call. ![](bill-pipelines)
3. [Estimate a backfill](#bill-estimates) — The runs it will make and what they should cost, before you start. ![](bill-backfill)
4. [Pay an invoice](#bill-invoices) — Drafts, issued invoices, credit notes, card or bank slip, receipts. ![](bill-invoice)
5. [Find a billing document](#bill-documents) — Every bill, slip, receipt and statement, and checking a receipt. ![](bill-documents)

## Questions
### Why does the month on Cost & usage change after the month has ended?
Usage is rolled up every few minutes, so the last runs of a month catch up shortly after it ends. Once the month is
over in your billing time zone its invoice is issued and frozen. See [Invoices, credit notes and paying](#bill-invoices).

### Which time zone are my days counted in?
Your workspace's billing time zone, shown as **Days in** on Cost & usage and beside the invoice's period (America/Chicago
unless your account team set another). See [Your billing time zone](#bill-usage--your-billing-time-zone).

### What does one pipeline cost me?
Open **Cost by pipeline** on Cost & usage: each pipeline's runs, cost, cost per run and what it was spent on, and each
run below. See [Cost by pipeline and by run](#bill-cost--cost-by-pipeline-and-by-run).

### Is testing in the sandbox billed?
No, never. See [What is not billed](#bill-not-billed).

### If I retry a failed run, do I pay twice?
Not for the steps that already worked: **Retry from the failed step** reuses their outputs. **Run again from the
start** runs, and bills, every step again. See [Not billed twice](#bill-not-billed--not-billed-twice).

### How do I pay?
With **Pay now** by card, when card payment is on for your account, or by bank transfer with **Upload payment slip**.
A receipt is issued once the payment is confirmed. See [Pay an invoice](#bill-invoices--pay-an-invoice).

### A line on my bill looks wrong. What can I do?
Choose the line on Cost & usage to see what is behind it, then ask your account team: credit notes and corrections are
theirs. See [Line by line](#bill-cost--line-by-line).

## Related
- developers
- runs
- administration
