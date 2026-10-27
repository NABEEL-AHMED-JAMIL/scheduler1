---
id: doc-review
title: Review a document
summary: The page beside its fields; claim it, correct a value, approve, or reject with a reason.
section: Read and review
who: Anyone whose page access includes Review › Documents
where: Review › Documents (/review/documents)
related: doc-reading, doc-checks, doc-bulk-review, doc-approved-data
popular: Review a document
---
A document that was not approved on its own waits in **Run & review › Review › Documents** for a person: you check
the values it was unsure of against the page, correct what is wrong, and approve or reject it. Only an approved
document's values reach its type's approved data and start what its approval starts.

## The queue
**Review › Documents** lists the documents that were not approved on their own, oldest first. Filter by state (**In
review**, **Approved**, **Rejected**), type, who has claimed it (**Anyone's**, **Claimed by me**, **Not claimed**,
**Claimed by others**), how sure the least sure value is, and how long it has waited.

| Column | Says |
|---|---|
| **Document** | The file's name |
| **Type** | Its type and version |
| **To check** | How many of its values need a look |
| **Least sure** | Its least sure value |
| **Waiting since** | When it arrived for review |
| **Claimed** | Who is on it |

Choose a document to open it, or **Start reviewing** to open the first one nobody else holds.

![The document review queue](doc-review-queue "Review › Documents: what waits, how much to check and who has claimed it")

## Check and decide
The review screen shows the page on the left and the **Extracted fields** on the right.

1. Choose **Claim** so that others see you are on it. **Let go** gives it back.
2. Work down the fields flagged **check**. Choosing a field draws its box on the page; ↓ and ↑ move between fields.
   Zoom the page with − and +.
3. Correct a value by typing over it. For a table, edit the cells or choose **Add row**.
4. Read the **Rule check** and, if shown, **Before it can be approved**.
5. Choose **Save corrections** to keep your changes, or **Discard changes**.
6. Decide:
   - **Approve & next** (or press A) approves it and opens the next document.
   - **Reject** (or press R) asks **Why**, which is kept with the document; choose **Reject** again to confirm.

![A referral on the review screen](doc-review "The review screen: the page with each value's box, the fields with how sure each is, and the rule check")

On approve, the document's values go to its type's approved data (**Documents › Approved data**), and your corrections
are kept with it. **Corrections** on the screen lists each change: the field, what it was, what it is now, who changed
it and when.

![Reject this document](doc-reject "Reject: a reason is required and kept with the document")

> **Tip:** The shortcuts (A approve, R reject, ↓ next field) do nothing while you are typing in a field, so you cannot
> approve by accident.

## When you cannot decide it
- **Claimed by** someone else: they decide it; the screen is read-only for you.
- **Approved** or **Rejected** already: the screen says by whom and when, and is read-only.
- **Failed**: the extraction did not finish. Extract it again from **Documents › Documents in**.

> **Note:** What a model read is a draft. Approving it says a person checked it against the page; the approval records
> who you are.

## Example
Greta Fischer opens `referral-upload-8.pdf`, a **Referral**. **Referral date** and **Referred to** are required but
were not found, so **Before it can be approved** lists both. The page really has neither, so she does not guess: she
chooses **Reject** with the reason "No referral date or receiving service; clinic asked to resend". When the clinic's
corrected letter arrives, she checks it, and **Approve & next** puts its values in the Referral approved data.
