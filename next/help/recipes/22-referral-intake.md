---
id: rcp-referral-intake
title: Referral letters by upload, and the same file twice
summary: Add the Referral document type, upload a referral, check it in review, and see a second upload of the same file kept once as a Duplicate.
section: Healthcare
who: A workspace administrator adds the type; anyone whose page access includes Documents uploads; a document reviewer decides
where: Documents › Document types (/documents/types); Documents › Intake › Upload (/documents/intake/upload); Review › Documents (/review/documents)
related: doc-intake, doc-types, doc-review, doc-approved-data, doc-limits, rcp-journey-referral
---
Referral letters arrive from clinics as PDFs. This recipe sets the workspace up to read them: it adds the ready-made
**Referral** type, uploads a letter so the console reads the patient, the reason and the urgency from it, and sends
what it is unsure of to a reviewer. It also shows what happens when the same letter is uploaded again, as happens when
two people at the front desk both file it: the workspace keeps one document, and the second upload is listed as a
**Duplicate**.

> **Note:** The letter is synthetic and every name in it fictional. What the console reads from a page is a draft for a
> person to check.

## What you'll build

- The **Referral** document type, from the starters.
- One **Referral** document read from `referral-SV-000204.pdf`, checked and approved in **Review › Documents**.
- A second upload of the same file, refused as a copy: no second document, nothing read twice.

![What arrived after two uploads of one file](rcp-x-referral-duplicate "Summit Valley's Intake › Upload: the first upload Taken, the second a Duplicate of it, both pointing to the one document")

## What you need first

1. Page access to **Documents** (and to **Review › Documents** for the reviewer). Adding a document type needs a
   workspace administrator.
2. A model connection the workspace may use for documents (**Settings › Model connections**, see
   [Your models](#ai-models)): the console reads the fields with it.
3. The sample letter [referral-SV-000204.pdf](/help/samples/referral-intake/referral-SV-000204.pdf): one page from the
   fictional Northside Family Clinic, for the fictional patient Harold Brennan, `SV-000204`.

## Build it

### Add the Referral type

1. Open **Get data in › Documents** and its **Document types** tab.
2. Choose **Add from starters**. Under **Healthcare**, tick **Referral** and choose **Add**. It now lists as one of this
   workspace's own types (see [Document types](#doc-types)).

### Upload the letter

1. Open the **Intake** tab, then **Upload**, and choose **Upload documents**.
2. Drop `referral-SV-000204.pdf` on the box (or **Choose files**) and choose **Upload**. The dialog says what became of
   it.
3. Under **What arrived**, the file shows **Channel** **Upload**, **Outcome** **Taken**, and the number of the
   **Document** it became.

### Upload it again

1. Choose **Upload documents** once more and upload the **same** file.
2. **What arrived** now lists it twice. The newer line's **Outcome** is **Duplicate**, with "The same file as
   "referral-SV-000204.pdf" … no second document was made.", and its **Document** is the same number as the first.

### Check the referral

1. Open **Run & review › Review › Documents**. The letter waits there: a referral is approved on its own only when every
   value is sure enough and its key fields (patient ID, referring NPI) were confirmed by lookups against your reference
   data, and this workspace has none yet.
2. Open it, choose **Claim**, and work down the fields marked **check**, comparing each with the page on the left
   (see [Review a document](#doc-review)). The letter says: referral date `2026-10-20`, referred to `Summit Valley
   Medical Center, Wound care clinic`, patient `Harold Brennan`, born `1951-03-14`, urgency `Urgent`.
3. Correct what was read wrongly, choose **Save corrections**, then **Approve & next**.

> **Note:** Not yet verified end to end. Summit Valley's run of this recipe confirmed the upload and the duplicate
> (job "The same file twice"); what the model reads from this sample letter, and so what waits for a reviewer, depends
> on your model and was not checked.

## Check it worked

- **Documents › Intake › Upload › What arrived**: two lines for `referral-SV-000204.pdf`, **Taken** and **Duplicate**,
  both linked to the one document.
- **Documents › Documents in**: one document of type **Referral**, not two.
- After the approval: **Documents › Approved data** has one Referral row with the values you checked (see
  [Approved data](#doc-approved-data)).

At Summit Valley, `referral-upload-8.pdf` was uploaded twice by the workspace administrator: the first **Taken**, the
second **Duplicate**, both document #1013.

## Common mistakes

- **The second upload made no document.** That is the point: the same file, by any channel (upload, Email-in, a form),
  is kept once. To read a corrected letter, upload the corrected file; it is a different file.
- **The document has the wrong type.** The workspace had no **Referral** type when it arrived, or another type fits the
  words on the page better. Add the type first, then upload again a file not yet uploaded.
- **Nothing appears in Review › Documents.** Every value was read surely enough and the document was approved on its
  own, or you lack page access to **Review › Documents**. Look in **Documents › Documents in** for its state.
- **Approve is refused.** A required field is empty: read **Before it can be approved** and fill it from the page.
  Never guess a value the letter does not have; reject it with a reason instead.
