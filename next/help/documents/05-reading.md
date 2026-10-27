---
id: doc-reading
title: How documents are read
summary: Text read from scans and photos, the document matched to a type, each value with how sure it is, and one document per file.
section: Read and review
who: Anyone whose page access includes Documents in
where: Documents › Documents in (/documents/in)
related: doc-intake, doc-types, doc-review, doc-limits
---
When a file arrives, three things happen before anyone looks at it:

1. **Its pages are read.** The platform's own text recognition (OCR) reads each page, so a scan, a fax or a phone photo
   becomes text with the position of every word.
2. **It is matched to a type.** The text is compared with every active document type (its **What it is** and **Words on
   the page**). You can also pick the type yourself when you read a stored file.
3. **Its fields are extracted.** The type's fields and tables are read from the text, each value with how sure the
   reading is and where on the page it was found.

What comes out is a draft: values a person checks in review, unless every one is sure enough and the type's key fields
were confirmed by their lookups, so that the document is approved on its own (see
[Auto-approve needs key fields](#doc-types)).

![Documents in](doc-documents-in "Documents in: each document's type, fields to check, confidence and state")

## Documents in
**Get data in › Documents › Documents in** lists the recent documents. The tiles count the **Documents** of the last
30 days, the share **Auto-approved**, how many are **In review**, and **Field accuracy**, the share of values reviewers
left as they were read.

| Column | Says |
|---|---|
| **Document** | The file's own name, where it came from and its pages |
| **Type** | The type it was matched to, or **Not classified** |
| **Fields** | How many values were read, and how many are **to check** |
| **Confidence** | The least sure value |
| **State** | See below |
| **Received** | When |

Filter by type and state, or search. **Open** in a row's menu goes to its review screen; **Extract again** reads it
again, as the same type or after you fix the type.

## How sure it is
Each value has a confidence from 0 to 100 %, drawn as a bar. A value is flagged **check** when it is less sure than the
type's **Auto-approve at** line (80 % when the type has none), when a problem was found with it, or when a required
value was not found. A value a reviewer corrected counts as the reviewer's.

> **Note:** Confidence is how sure the reading is, not whether the document is true. A clear page with a wrong number on
> it reads at 100 %. That is what rules and review are for.

## The states
| State | Means |
|---|---|
| **Queued**, **Running** | Being read |
| **Unclassified** | It did not look like any active type: pick the type and choose **Extract again** |
| **Failed** | The extraction did not finish; choose **Extract again** |
| **In review** | Waiting for a person in **Review › Documents** |
| **Approved** | Approved by a reviewer |
| **Auto-approved** | Every value was sure enough, nothing was wrong, and every key field's lookup confirmed it |
| **Rejected** | A reviewer rejected it, with a reason |

## One document per file
Each file is one document. A file the workspace has received before, by any channel, is recognised by its content and
kept once: **What arrived** lists it as **Duplicate** and links the earlier document, and it is not read again. A
document of several kinds of page (a referral with a scanned clinical summary) is best sent as separate files, each
matched to its own type.

## Example
Summit Valley's `referral-SV-000117-page2-scan.pdf` is a faxed page. The text recognition reads "left foot plantar
ulcer 4 x 3 cm"; the page is matched to **Wound assessment form**; **Site**, **Length (cm)** and **Width (cm)** are read
at 91 to 92 % and **Stage** is not found at all, so all of them are flagged for Greta Fischer to check against the page.
