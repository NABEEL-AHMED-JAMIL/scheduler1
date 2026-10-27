---
id: tour-referral
title: A referral arrives by email
summary: Elena Marsh's referral letter is mailed to the workspace, read into fields and approved by a person.
section: Arrival
who: Anyone whose page access includes Documents; the review is a document reviewer's
where: Documents › Intake (/documents/intake/email-in); Documents › Documents in (/documents/in); Review › Documents (/review/documents)
related: tour-journey-starts, tour-registration
---
This tour follows one patient through the ETL Console, from the first letter to the last chart. The hospital is
**Summit Valley Health System**, a regional hospital group; the patient is **Elena Marsh**, 67, record number
SV-000117, admitted with type 2 diabetes, an infected wound on her left foot and heart failure.

> **Note:** Summit Valley, Elena Marsh and every person, number and result in this tour are fictional. The data is
> synthetic, made for the demonstration. Nothing here is clinical advice, and every model answer you see is a DRAFT for
> a person to check.

## What happened
A community clinic, Northside Clinic, mails a referral for Elena to Summit Valley. It is sent to the workspace's own
**Email-in** address, so nobody has to download and upload it. The message carries two PDF attachments: the two-page
letter, and its second page as a scan.

1. Each attachment becomes a document. **Documents › Intake › Email-in** lists both under **What arrived**, from
   "Referral: Elena Marsh (SV-000117)", with the outcome **Taken**.
2. Document Intelligence reads the letter against the **Referral** document type: the patient, the reason for the
   referral, its urgency and the other fields the type asks for.
3. The letter lacked two values the type requires, the referral date and who it was referred to. Values a document is
   missing or unsure of send it to **Review › Documents**.
4. Greta Fischer, from health information, opens the document, fills in the two values and approves it. On
   **Documents › Documents in** the referral now reads **Approved**, 13 fields.

![Documents in, with Elena Marsh's referral approved](tour-referral "Documents › Documents in: the referral from Northside Clinic, read as a Referral and approved (fictional patient, synthetic data)")

## Where to see it
- **Documents › Intake**, tab **Email-in**: the workspace's address and everything that arrived by mail. The same file
  mailed again is kept once.
- **Documents › Documents in**: each document, its type, how many fields were read, how sure the reading was, and its
  state.
- **Review › Documents**: the documents waiting for a person, oldest first.

## Good to know
- Email-in takes up to 20 attachments a message, 20 MB each. Anyone who knows the address can send to it, so an
  administrator can give the workspace a new address with **New address** to shut out the old one.
- An approved document's values land in **Documents › Approved data**, where pipelines can read them.

## Learn more
The Documents topic says more: [Upload documents and mail them in](#doc-intake), [Document types](#doc-types) and [Review a document](#doc-review).
Next in the tour: [the journey starts](#tour-journey-starts).
