---
id: dash-catalog
title: The Data Catalog
summary: Every dataset, file and document type in the workspace, who owns it, how fresh it is, which fields are sensitive, and asking for access to masked values.
section: Analysis
who: Anyone whose page access includes Data Catalog; marking fields and deciding access requests is a workspace administrator's
where: See results › Analysis › Data Catalog (/data/catalog)
related: dash-studio, dash-files, dash-boards
popular: Ask for access to masked data
---
The Data Catalog lists every **asset** in the workspace: datasets, files and document types. For each it says what it
holds, who owns it, how fresh it is, and which of its fields are sensitive. A field marked sensitive is masked for
anyone without access to it, here, in Analytics Studio, on dashboards and in Ask your data alike.

## Find an asset
1. Open **See results › Analysis › Data Catalog**. The figures at the top count the **Assets**, those **With
   sensitive fields**, those **Stale over 30 days** and those **Without an owner**.
2. Narrow the list: **All**, **Datasets**, **Files** or **Document types**; **Any**, **Sensitive**, **Stale** or
   **Without an owner**; or type in **Search name, column or tag…**. **Deleted too** adds assets whose source has gone.
3. Each row shows the **Asset** and where it is, its **Type**, **Owner**, **Freshness**, **Sensitive fields**,
   **Sensitivity** and **Quality**.
4. Choose a row to open its panel.

The notice above the list says how many assets hold fields marked sensitive, with **Show them**.

![The Data Catalog](dash-catalog "The Data Catalog: the figures, the sensitive-data notice, and the assets with their sensitivity")

## What an asset's panel shows
- Its **sensitivity** (**Unclassified**, **Public**, **Internal**, **Confidential** or **Restricted**), where it is,
  its quality and when it last changed.
- **About**: its description and owner.
- **Columns**: each column's type, how much of it is empty, and what it **Holds**. A column marked sensitive shows
  **Sensitive**; one whose name looks like patient data but carries no mark says *looks like* and what.
- **Lineage**: what feeds the asset and what reads it, and **Used by**.

## Sensitive fields and masking
A column can be marked as holding: email, phone, national id, card number, bank account, person name, address, date of
birth, medical record number, health plan number or ZIP code. An asset's sensitivity follows its marks: a national
id, card number, bank account, date of birth, medical record number or health plan number makes it **Restricted**, any
other mark **Confidential**.

A new file (an upload, or a file a pipeline writes) is checked from a sample of its first rows before Analytics first
reads it, so its sensitive columns are masked from the first read.

A workspace administrator can, in an asset's panel:
1. Choose **Scan for sensitive data** to check the columns again, or **Profile** to read them.
2. Set what each column **Holds**, or **nothing sensitive**.
3. Set the asset's **Sensitivity** by hand, or leave it on **Follow its tags**.
4. Write the description, choose **Make me the owner**, and **Save details**.

## Ask for access to masked values
When an asset's values are masked for you, its panel says *Its sensitive values are masked for you*.

1. Under **Why you need it**, say what you will use the values for.
2. Under **For**, pick **1 day**, **7 days**, **30 days** or **90 days**.
3. Choose **Request access**.

The panel then says when you asked. A workspace administrator decides in their task inbox; once granted, the panel says
*You can see its values until* the date and time it ends, and the masking lifts for you until then.

![Masked for a researcher](dash-catalog-access "An asset masked for a researcher, with Why you need it, For and Request access")

> **Privacy:** Access is granted for a time, never for good. When it ends, the values are masked for you again.

## Limits
| What | Limit |
|---|---|
| Reason for an access request | 1,000 characters |
| Access lasts | 1, 7, 30 or 90 days |
| An asset's description | 4,000 characters |

## Example
Dr. Hana Ito, a researcher at Summit Valley Health System, opens the Patient 360 file *latest.csv*. Its `name`, `dob`
and `mrn` columns are masked for her. She asks for access for **7 days**, *to check the ages in the diabetes cohort*.
The workspace administrator approves it, and for a week she sees the values; then they are masked again. Her usual
work uses *research.csv*, a de-identified extract that needs no access at all.
