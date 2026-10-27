---
id: doc-types
title: Document types
summary: Add ready-made types for healthcare and finance, or make your own with its fields, line-item tables and when it is approved on its own.
section: Document types
who: Workspace administrators make and change document types; anyone whose page access includes Document types reads them
where: Documents › Document types (/documents/types)
related: doc-checks, doc-reading, doc-review, doc-when-approved
---
A document type tells the console what one kind of document is and what to read from it: a referral, a lab result, an
invoice. Each incoming document is matched to a type and its fields are read against it. Start from a ready-made type
and change it to fit your paperwork, or make your own.

![The Document types tab](doc-types "Document types: fields, tables and rules per type, its auto-approve line, version, and what its approval starts")

## The list
| Column | Says |
|---|---|
| **Type** | Its name, with its key underneath |
| **Fields**, **Tables**, **Rules** | How many it has |
| **Auto-approve at** | How sure every value must be for a document to be approved on its own, or **Never**; **Off: every document reviewed** when the type cannot approve on its own (see [Auto-approve needs key fields](#doc-types)) |
| **Version** | The current version |
| **Kind** | **This workspace** (yours) or **Built-in** |
| **When approved, starts…** | The schedules an approved document of this type starts; see [When a document is approved](#doc-when-approved) |
| **State** | **Active** or **Inactive** |

## Add from starters
1. Open **Get data in › Documents › Document types** and choose **Add from starters**.
2. The starters are grouped by the work that reads them: **Healthcare** (Referral, Lab result, Discharge summary,
   Insurance card, Prior authorization, Patient intake form, Medication list, Consent form) and **ERP and finance**
   (Invoice, Purchase order, Contract, Receipt, Delivery note). Each says what it reads.
3. Tick the ones you receive and choose **Add**. Types you already have say **Added**.

Each one added is this workspace's own type, to change as you like.

![Add from starters](doc-starters "Add from starters: ready-made types by market, each with the fields it reads")

## Make your own type
1. Choose **New document type**.
2. Give it a **Name** and a **Key** in lower_snake_case, such as `wound_assessment`. The key cannot change later.
3. **What it is**: one sentence the model reads when it decides what a document is, such as "A wound assessment: the
   patient, the wound's site, its size in centimetres and its stage."
4. **Words on the page**: comma-separated words that appear on this kind of document, to help tell it apart.
5. **Auto-approve at**: a percentage. A document whose every value is at least this sure, with no problem, and whose
   key fields its lookups confirmed, is approved on its own. Leave it empty to send every document to a reviewer.
6. **Instructions**: anything the model should know when it reads this type, such as your own conventions.
7. Under **Fields**, add each value to read: a key, a **Label**, a type (`text`, `number`, `integer`, `money`, `date`,
   `boolean` or `choice`, with its options), **Required**, and the other words it goes by on a page (**Also written
   as**: Invoice No., Invoice #). A choice may also say how a page writes each option (**Options written as**:
   `High = H; Low = L; Normal = N`): a lab printout's `H` is then read as High, and the `H` is where High came from. Each
   word belongs to one option, and is never another option itself.
8. Under **Line-item tables**, choose **Add table** for rows such as invoice lines or lab tests: a key, a label, its
   columns, and **At least one row** if a document must have one.
9. Under **Rules**, add the checks a document must pass. See [Checks on a document](#doc-checks).
10. Choose **Save**.

![A document type open in its panel](doc-type-editor "A document type: what it is, the words on the page, the auto-approve line, and its fields")

## Change a type
Open the type and choose **Edit**. When you are done, **Save as the next version**: documents read before keep the
version they were read with, and the **Versions** list keeps every one. **Switch off** stops a type being used for new
documents; **Switch on** brings it back.

A **Built-in** type is read-only. Choose **Customise** to make your own copy: it keeps the same key, so once saved it
reads this workspace's documents in the built-in one's place.

> **Note:** A value read from a document is shown exactly as it was read, never reformatted as a number, money or a
> date, so a reviewer compares the page with what was really kept.

## Example
Summit Valley added the eight healthcare starters and the five finance ones, then made its own **Wound assessment
form** (patient, site, length and width in centimetres, stage) and a **Lab panel** with arithmetic and unusual-value
rules. Its **Invoice**, changed once, is at **v2**.

## Auto-approve needs key fields
Confidence alone never approves a document. A type approves its documents on its own only when:

1. it has an **Auto-approve at** line;
2. its **key fields** are marked: tick **Key** on each field that says who or what the document is about, such as the
   payer, the patient, the member ID or the accession number (a document's fields only, never a table's columns);
3. every key field has a **Lookup** rule against your reference data, a dataset or a CSV or JSON file in one of your
   buckets (see [Checks a document must pass](#doc-checks)).

A document is then approved on its own only when every value clears the line, nothing is wrong, and **every key
field's lookup found its value**. Otherwise it waits in review.

The type's panel says which: **Documents are approved on their own when...**, or **Auto-approve is off: every document of
this type goes to review**, with what is missing. The starters mark their key fields (the insurance card's payer and
member ID, the lab result's patient ID and accession number, the referral's patient ID and referring NPI, the intake
form's patient name, date of birth and insurance member ID); add a lookup on each to turn auto-approve on.

> **Note:** Types made before this rule keep their line, but their documents go to review until their key fields are
> marked and looked up. The list shows **Off: every document reviewed** under such a type's line.

