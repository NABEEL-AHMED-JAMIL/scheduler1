---
id: doc-checks
title: Checks on a document
summary: Rules a document type keeps: sums and products, dates in order, patterns and check digits, duplicates, reference lists and unusual values.
section: Document types
who: Workspace administrators add rules; reviewers see each rule's result on the review screen
where: Documents › Document types (/documents/types)
related: doc-types, doc-review, doc-bulk-review
---
A model can read a number perfectly and the document can still be wrong: lines that do not add up, a due date before
the invoice date, an invoice paid twice. A document type's **Rules** check each document after it is read. A rule that
fails is shown to the reviewer with your message, and a document with a problem is not approved on its own.

## Add a rule
1. Open the document type and choose **Edit**.
2. Under **Rules**, choose **Add rule** and pick its kind.
3. Pick what it checks (the fields, the table, the columns) and fill in its settings.
4. Optionally write **What a reviewer is told when it fails**.
5. Choose **Save as the next version**.

![An invoice type's rules](doc-checks "Rules: sums, dates in order, a reference list and an unusual total, each with the message a reviewer sees")

## The kinds of rule
**On the document itself**

| Rule | Checks | You give |
|---|---|---|
| **A table column adds up to a field** | The column's rows sum to a field (lines to the subtotal) | The table, the column, the field, a tolerance (0.01) |
| **Fields add up to a field** | Some fields sum to another (subtotal + tax = total) | The fields, the total field, a tolerance |
| **In every row, two columns multiply to a third** | quantity × unit price = amount, on each line | The table, the two columns, the product column, a tolerance |
| **One date is on or before another** | Invoice date on or before due date; birth before admission | The earlier date and the later date |
| **Every value has a form (a pattern)** | A value matches a pattern, such as `[A-Z]{2}[0-9]{6}` | The field (or a table column) and the pattern |
| **An ID's check digit holds** | The last digit of an ID is right | The field, and **Luhn** (cards, many account numbers) or the IBAN check |

**Beyond the one document**

| Rule | Checks | You give |
|---|---|---|
| **Not a duplicate of another document** | No other document of this type has the same values | The fields a duplicate shares (vendor and invoice number), and optionally **Within days** (all when empty) |
| **A value is in a reference list** | A value appears in a list you keep | A list name, and either a file in a bucket (CSV, TSV, JSON or JSON Lines: its storage connection, file and column) or another document type's approved data (its field) |
| **A number is not unusual for this type** | A number is not far from what approved documents of this type usually say | The number field; optionally a field to compare within (the same vendor); **Unusually high or low**, high only or low only; more than N × the median, or more than k MADs away (3.5 when both are empty); and **Applies after N approved documents** (5) |

## What the reviewer sees
On the review screen, **Rule check** lists each rule:

- a tick and **holds** when it passed;
- a cross and **fails** when it did not, with your message, and for a duplicate **Open the other document**;
- a dash and **not checked: a value it needs is missing** when a field it needs was not read.

**Before it can be approved** lists what must be fixed first, such as a required field not found on the document.

> **Tip:** A rule that fails is a question for a person, not a refusal. Write the message as what to check: "The line
> items do not add up to the subtotal."

> **Note:** In bulk review, documents whose rules fail are left out unless the workspace's review policy includes them.
> See [Review many documents at once](#doc-bulk-review).

## Example
Summit Valley's **Invoice** type keeps six rules: the line items add up to the subtotal, the due date is not before the
invoice date, subtotal and tax add up to the total, quantity × unit price = amount on every line, the PO number is in
the open purchase orders list (`finance/ap/open-pos.csv` in the finance bucket), and the total is not unusually high for
the same vendor. A supplier invoice for a PO the hospital never raised stops in review with the lookup rule failing.
