---
id: qa-documents
title: "Test area 05: documents"
summary: Document types and starters, upload and Email-in, duplicates, the file drop, review and corrections, rules, bulk review, approved data and what an approval starts.
section: Data in and build
who: Testers; as the administrator (A) and a reviewer whose access includes Review › Documents (R), with F, V and X for access and isolation
where: Documents › Intake (/documents/intake); Documents › Documents in (/documents/in); Documents › Document types (/documents/types); Review › Documents (/review/documents); Documents › Approved data (/documents/approved-data)
related: doc-intake, doc-file-drop, doc-types, doc-checks, doc-review, doc-bulk-review, doc-approved-data, doc-when-approved, doc-limits
---
These checks follow a document from the moment it arrives to its approved data: the types it is matched to, the ways it
comes in, how it is read, how a person checks and decides it, and what its approval starts. A model's reading is a draft:
nothing reaches approved data until a person (or the type's auto-approve line) passes it.

**Before you start:** a few synthetic PDFs: two referral letters, one invoice whose lines do not add up to its subtotal,
and a copy of one referral under another file name. An email account you may send from, if your platform has Email-in.
A small CSV, a synthetic photo (JPEG) and a file with a wrong extension (a text file renamed `photo.jpg`) for the file
drop.

Tested by ______ on ______

## Types and intake
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-05.01 | Add types from the starters | As A, **Documents › Document types** › **Add from starters**: tick **Referral** and **Invoice**; **Add** | Both are listed as **This workspace**, **Active**; opening the starters again shows them **Added** | ☐ Pass ☐ Fail |
| QA-05.02 | A type's key is fixed | **New document type**: **Name** `QA wound form`, **Key** `qa_wound_form`, a few fields; **Save**; open it with **Edit** | The key cannot be changed; **Save as the next version** makes v2 and **Versions** lists both | ☐ Pass ☐ Fail |
| QA-05.03 | Upload documents | **Documents › Intake › Upload** › **Upload documents**: drop the two referrals; **Upload** | The dialog says what became of each; **What arrived** lists them as **Taken**, channel **Upload**, each linked to its document | ☐ Pass ☐ Fail |
| QA-05.04 | They are read and matched | **Documents › Documents in** | Each shows its **Type** (**Referral**), **Fields** with how many are **to check**, **Confidence** and **State** (**In review** or **Auto-approved**) | ☐ Pass ☐ Fail |
| QA-05.05 | The same file twice is kept once | Upload the copy of a referral under another file name | **What arrived** lists it as **Duplicate**, naming the earlier document; no second document is made | ☐ Pass ☐ Fail |
| QA-05.06 | Email-in | **Intake › Email-in**: **Turn on** if needed; copy the address; mail a referral PDF to it | **What arrived** lists the attachment with channel **Email**, the sender and the subject | ☐ Pass ☐ Fail |
| QA-05.07 | A new Email-in address shuts out the old | **New address**; mail the old address again | The workspace has a new address; the mail to the old one makes no document | ☐ Pass ☐ Fail |

## The file drop
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-05.08 | Set it up | As A, **Intake › File drop** › **Set up the file drop** (or **Change**): pick a storage connection; **Turn on the file drop** | **Settings** names the connection, **Where files land** (`intake/<date>/<arrival>-<file name>`) and the **Size limit** | ☐ Pass ☐ Fail |
| QA-05.09 | Drop files | Drop the CSV and the photo on **Drop files here** | **This session's uploads** shows each **Uploaded** with its SHA-256; **Arrivals** lists them with **Uploaded by** | ☐ Pass ☐ Fail |
| QA-05.10 | A file whose contents do not match its name is refused | Drop the text file renamed `photo.jpg` | **Refused**, with why; it is not stored and not in **Arrivals** | ☐ Pass ☐ Fail |
| QA-05.11 | The file drop is not read as a document | Look at **Documents in** after QA-05.09 | The dropped files are not listed there: the file drop only stores files for pipelines | ☐ Pass ☐ Fail |

## Review and decide
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-05.12 | The queue | As R, **Review › Documents** | The documents not approved on their own are listed, oldest first, with **To check**, **Least sure**, **Waiting since** and **Claimed** | ☐ Pass ☐ Fail |
| QA-05.13 | Claim a document | Open one; **Claim** | **Claimed** shows R; as A, the same document is read-only, **Claimed by** R | ☐ Pass ☐ Fail |
| QA-05.14 | A field shows where it was read | Choose a field flagged **check** | Its box is drawn on the page; ↓ and ↑ move between fields | ☐ Pass ☐ Fail |
| QA-05.15 | Correct and keep the correction | Type over a value; **Save corrections** | **Corrections** lists the field, what it was, what it is now, R and the time | ☐ Pass ☐ Fail |
| QA-05.16 | A reject needs a reason | **Reject** (or R); leave **Why** empty; then type a reason and **Reject** again | It cannot be sent without a reason; with one, the document reads **Rejected** and the reason is kept | ☐ Pass ☐ Fail |
| QA-05.17 | Approve | Open the other referral; **Approve & next** (or A) | It reads **Approved**; the next document opens | ☐ Pass ☐ Fail |
| QA-05.18 | The shortcuts do nothing while typing | Click into a field and type the letter `a` | The letter is typed; nothing is approved | ☐ Pass ☐ Fail |
| QA-05.19 | A rule that fails | As A, on **Invoice** add the rule **A table column adds up to a field** (lines to subtotal), **Save as the next version**; upload the invoice that does not add up; open it as R | **Rule check** shows the rule with a cross and **fails**, with its message | ☐ Pass ☐ Fail |

## Bulk review
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-05.20 | Bulk approve is off by the policy | As A, **Administration › Data policies** › **Bulk review**: **Allow bulk approve of documents** off; **Save review policy**. As R, tick two documents, **Approve** | Each is skipped with *Bulk approve is off in this workspace* | ☐ Pass ☐ Fail |
| QA-05.21 | Bulk approve, rules failing left out | Turn it on (with **Include documents whose rules fail** off). As R, tick several documents including the invoice; **Approve** | The panel says how many will be approved and skips the invoice with its reason; a comment is optional; the button names the count (**Approve 3**) | ☐ Pass ☐ Fail |
| QA-05.22 | Over 25 needs the count typed | Select more than 25 documents (or **Select all matching**); **Approve** | The panel asks you to type the number before it can be sent | ☐ Pass ☐ Fail |
| QA-05.23 | A bulk reject needs a comment | Tick two; **Reject** with no comment | It cannot be sent; with a comment, each is rejected and lists the comment | ☐ Pass ☐ Fail |

## Approved data and what it starts
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-05.24 | The approved row | **Documents › Approved data**, pick **Referral** | A row for the approved referral, **Approved** **By a reviewer**, with R's correction in its value | ☐ Pass ☐ Fail |
| QA-05.25 | Download it | **CSV**, then **JSON Lines** | Both files hold every approved row of the type | ☐ Pass ☐ Fail |
| QA-05.26 | A rejected document is not there | Look for the rejected referral | It has no row in approved data | ☐ Pass ☐ Fail |
| QA-05.27 | What a type's approval starts | **Document types**, the column **When approved, starts…** | **Nothing yet** for a type no schedule starts on; after [QA-08.16](#qa-triggers), the schedule's name, linked | ☐ Pass ☐ Fail |

## Access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-05.28 | No Documents for the front desk | As F, go to `/documents/in` and `/review/documents` | Both are refused (**… isn't part of your access**) | ☐ Pass ☐ Fail |
| QA-05.29 | Another workspace cannot open a document | As A, copy the address of a document's review screen; as X, open it | **This document isn't here**: it may have been removed, or the link belongs to another workspace | ☐ Pass ☐ Fail |
| QA-05.30 | Another workspace's lists | As X, **Documents in**, **Review › Documents**, **Approved data** | None of A's documents is listed | ☐ Pass ☐ Fail |

## Example
At Summit Valley the referral `referral-upload-8.pdf` arrives once as **Taken**, and the same file uploaded again is
listed as **Duplicate**, naming the first: no second document is made. Greta Fischer rejects a referral that has no
referral date, with her reason, and approves the clinic's corrected letter.
