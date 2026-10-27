---
id: bill-invoices
title: Invoices, credit notes and paying
summary: The month's running draft, the issued invoice with its lines frozen, credit notes, paying by card or with a payment slip, and receipts.
section: Invoices
who: Workspace administrators
where: Administration & billing › Billing › Invoices (/billing/invoices)
related: bill-documents, bill-cost, bill-usage
popular: Pay an invoice
---
Each month closes into an **invoice**. Until the month is over in your billing time zone, its invoice is a **draft**,
rebuilt from the meter as the month goes on. Once the month is over it is **issued**: its lines are frozen with the rate
card version that priced them, and its PDF is made.

## Find an invoice
1. Open **Administration & billing › Billing › Invoices**.
2. The figures at the top count what is **Overdue**, **Open**, the **Slips to verify** and what is **Paid**.
3. The list on the left holds every invoice and credit note, newest first, with its number, month, state and amount.
   Search with **Find a number, workspace, month**, or pick a state.
4. Choose one. Its lines, documents and payments open on the right, with a QR code of its number for the printed page.

![An invoice](bill-invoice "This month's running draft: its period and total, and one line per meter with its quantity, rate and amount")

## What an invoice shows
- Its number, its state (**Draft**, **Issued**, **Overdue** with the days, **Paid**), and the rate card version.
- **Billed to**: your billing profile (name, address, tax number). **Period**: the month, in your billing time zone.
  **Total**, and when it was issued and is due.
- **Lines**: one per meter, with **Qty**, **Rate** and **Amount**. A line may say what it includes at no charge, or
  that a pricing rule priced it. A draft says *A running draft — rebuilt from the meter until it is issued*.
- **Subtotal**, **Paid**, **Credited** and **Balance**.
- **Documents**: the invoice PDF once issued, the payment slips, receipts and credit notes.
- **Payments**: each payment, its method, reference, who sent it and its state.

**PDF** views or downloads the invoice; the ⋯ menu has **View PDF** and **Download PDF**.

## Pay an invoice
- **Pay now** (when card payment is on): pay by card on the payment provider's secure page. The payment counts as soon
  as the provider confirms it.
- **Upload payment slip**: for a bank transfer, upload the slip with the amount, the date and your reference. It shows
  as awaiting verification and counts once our team has seen the money arrive; a receipt is issued then.

If the last card payment failed, the invoice says so and why: try another card with **Pay now**, or upload a slip.

> **Privacy:** Card details are entered on the payment provider's own page, never in the console.

## Credit notes and receipts
- A **credit note** takes an amount off an issued invoice, with a reason. It has its own number (for example
  *CN-2026-09-0002*), is listed beside the invoice it is against, and lowers that invoice's balance.
- A **receipt** is issued for each verified payment. It is a PDF **Signed** with the platform's certificate; choose
  **Signed** to verify it.

Issuing an invoice, adding a manual line, crediting and voiding are our team's; ask your account team if a bill looks
wrong.

## Your billing profile
On **Invoices**, ⋯ › **Billing profile** sets who the invoice is made out to: **Legal name**, **Address**, **Billing email**, **Tax
number (VAT / GST)** (left empty, no tax is applied), the **Tax rate %** and its **Tax label**, the **Currency** and the
**Payment terms (days)**.

## Example
On 1 October, Summit Valley Health System's September invoice is issued: $25.00 on the *Standard 2026* card, due in
30 days. A duplicate conversion run is credited with a $5.00 credit note. Claire Martin uploads the bank transfer's
slip for the $20.00 balance; once it is verified, a signed receipt appears under **Documents** and the invoice is
**Paid**.
