---
id: doc-approved-data
title: Approved data
summary: Each document type's dataset, one row per approved document; download it, and read it in pipelines and checks.
section: Use the data
who: Anyone whose page access includes Approved data
where: Documents › Approved data (/documents/approved-data)
related: doc-review, doc-when-approved, doc-checks
---
Every document type has a dataset: one row per approved document, whether a reviewer approved it or it was approved on
its own, with a column per field. It is the clean, checked version of what came in, and what pipelines, reports and
other checks use.

![Approved data for the Referral type](doc-approved-data "Approved data: one row per approved referral, with who approved it and each field")

## Look at a type's data
1. Open **Get data in › Documents › Approved data**.
2. Pick the type in the list beside the title.
3. Each row shows:
   - **Document**: the document's number (it opens its review screen, read-only) and the type's version it was read
     with;
   - **Approved**: **By a reviewer** or **On its own**, and when;
   - a column per field, the value as approved, corrections included;
   - for each line-item table, how many rows it has.

Rows are paged; choose the page size at the foot.

## Who sees it unmasked
A document type the Data Catalog holds as **Confidential** or **Restricted** has its approved data masked for anyone who
is not its owner and has no access grant: on **Approved data**, in its CSV export, in an approved document's fields and
in Ask your data. Tagged columns are masked, and so is a person's name, email, phone number or id found in any field,
even when only one document is approved. Documents still in review are shown as they are, for the reviewer to check.

## Download it
Choose **CSV** or **JSON Lines** to download the type's whole dataset: CSV for a spreadsheet, JSON Lines for a
program.

> **Privacy:** Approved data holds what your documents say, often personal or patient data. Download it only to where
> your organisation allows that data to be, and give people page access to Approved data only when their work needs it.

## Use it in a pipeline
- The **Read documents** step reads a document type's approved data into a pipeline, so you can join it, compute with
  it, check it with a **Validate** step, write it to your storage or make a report from it.
- A pipeline can start each time a document of a type is approved, and read that document. See
  [When a document is approved](#doc-when-approved).

## Use it in a check
An **A value is in a reference list** rule can look values up in another type's approved data: an invoice's PO number
must be one of the approved purchase orders. See [Checks on a document](#doc-checks).

## Example
Summit Valley's **Referral** approved data has a row for Elena Marsh's referral, approved by a reviewer: referral
date 2026-10-18, date of birth 1959-03-14, patient ID SV-000117, the referring provider and NPI, the reason for
referral. A daily pipeline reads the Lab result approved data with **Read documents** and writes one row per test line
to a file, with the abnormal results flagged.
