---
id: doc-limits
title: Documents limits
summary: File kinds and sizes per channel, how many at once, review and bulk limits, and the ranges of type and rule settings.
section: Use the data
who: Everyone
where: Documents › Intake (/documents/intake); Review › Documents (/review/documents)
related: doc-intake, doc-file-drop, doc-types, doc-checks, doc-bulk-review
---
The limits a workspace meets when it sends documents in, defines types and reviews. Where a limit is your platform's
own setting, the screen names the number that applies to you.

## Sending documents in
| What | Limit |
|---|---|
| Files read as documents (Upload, Email-in, a stored file) | PDF, PNG, JPEG, TIFF or BMP |
| Upload documents | Up to 20 files at once |
| Email-in | The number of attachments a message and the size of each are shown on the Email-in card (for example up to 20 a message, 20 MB each) |
| The same file twice | Kept once, by any channel; the second is listed as **Duplicate** |
| File drop size | The platform's limit per file (the settings dialog names it), or a lower one an administrator sets |
| File drop kinds | Data, documents, images, audio and video, and archives; executables and scripts are refused |
| Arrivals listed | The newest 50 on the file drop |
| A file from a form | Sent to Document Intelligence when the form's **File upload** field says so |

## Document types and rules
| What | Limit |
|---|---|
| Key | lower_snake_case, unique, fixed once saved |
| Field types | text, number, integer, money, date, boolean, choice |
| Auto-approve at | Above 0 and up to 100 %; empty means never |
| Default "check" line | 80 % when a type has no auto-approve line |
| Duplicate rule, within days | 1 to 3,650; empty means all |
| Unusual-value rule | Applies after 2 to 1,000 approved documents (5 when empty); 3.5 MADs when no other setting is given |
| Reference list files | CSV, TSV, JSON or JSON Lines |
| Who may change types | Workspace administrators |

## Review
| What | Limit |
|---|---|
| Reject reason | Required; up to 500 characters |
| Bulk decision | Up to 100 documents; type the count back above 25 |
| Bulk comment | Up to 500 characters; required to reject |
| A claimed document | Only the person who claimed it decides it |
| Bulk approve | Only when the workspace's review policy allows it |

## Starting pipelines
| What | Limit |
|---|---|
| Documents per run | 1 to 50 |
| Files per run (file drop) | 1 to 50 |
