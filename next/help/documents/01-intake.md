---
id: doc-intake
title: Upload documents and mail them in
summary: Upload PDFs and images, read a file already in storage, or mail attachments to the workspace's own address; rotate it when it leaks.
section: Send documents in
who: Anyone whose page access includes Documents uploads and reads what arrived; workspace administrators turn Email-in on or off and give it a new address
where: Documents › Intake › Upload (/documents/intake/upload); Documents › Intake › Email-in (/documents/intake/email-in)
related: doc-file-drop, doc-reading, doc-types, doc-review, doc-limits
popular: Send documents in by email
---
**Documents › Intake** holds every way files reach the workspace. Two of its sections make **documents**: each file
you upload or mail in is read, matched to a document type and split into fields, and the values it is unsure of go to
**Review › Documents**. The third, **File drop**, stores files for pipelines without reading them; see
[The file drop](#doc-file-drop).

Whatever the channel, one file is one document, and a file the workspace already has (by any channel) is kept once.

## Upload documents
1. Open **Get data in › Documents** and choose the **Intake** tab, then **Upload**.
2. Choose **Upload documents**.
3. Drop the files on the box, or choose **Choose files**: PDF, PNG, JPEG, TIFF or BMP, up to 20 at once.
4. Choose **Upload**. The dialog then says what became of each file.

Each file is read, classified and extracted, and appears on **Documents › Documents in**. A type's values that need a
look wait in **Review › Documents**.

![The Upload section with what arrived](doc-intake-upload "Intake › Upload: Upload documents, Read a stored file, and what arrived, with a duplicate kept once")

## Read a file that is already in storage
If the file is already in one of the workspace's storage connections (a scan the copier saved to a bucket, say):

1. Choose **Read a stored file**.
2. Pick the **Storage connection**, and drop the file or name its **Folder** and file.
3. Under **Document type**, pick one, or leave it to the page: it is compared with every active type.
4. Choose **Read and extract**. The dialog shows each step: **Store the file**, **Read its pages (OCR)**, **Extract
   the fields**.

## What arrived
Under each section, **What arrived** lists the files offered by every channel, newest first:

| Column | Says |
|---|---|
| **File** | The file's own name |
| **Channel** | **Upload**, **Email**, **Form** or **Connector** |
| **From** | Who uploaded it, or the sender and subject of the mail |
| **Outcome** | **Taken**, **Duplicate** (the same file as an earlier one; no second document was made) or **Refused**, with the reason |
| **Document** | The document it became, as a link to its review screen |
| **Arrived** | When |

Filter it by channel with the list beside its title.

![Upload documents](doc-upload-dialog "Upload documents: PDFs and images, up to 20 at once")

## Mail documents in with Email-in
Every workspace can have its own address. Attachments mailed to it become documents, read and extracted as an upload
is.

1. Choose **Intake**, then **Email-in**.
2. If the workspace has no address yet, an administrator chooses **Turn on**.
3. Copy the address with the copy button and give it to whoever sends you documents: a referring clinic, a supplier's
   billing office, your own scanner.

The card says how many attachments a message may carry and how large each may be. **What arrived** shows each
attachment with the sender and subject, such as "Email from referrals@northside-clinic.example: Referral: Elena
Marsh".

![The Email-in section with the workspace's address](doc-email-in "Email-in: the address, its limits, New address and Turn off, and what arrived by mail")

## Give it a new address, or turn it off
Anyone who has the address can send to it. If it leaks, or a sender should no longer reach you, an administrator
chooses **New address**: the workspace gets a new address and the old one is shut out. Tell your senders the new one.

**Turn off** stops Email-in: mail to the address is ignored until it is turned on again.

> **Privacy:** Treat the address like a password. Give it only to senders who need it, and choose **New address** when
> it may have been shared further.

> **Note:** If the section says "Email-in is not set up on this platform", your platform has no mail domain for it
> yet. Ask your account team.

## Example
Northside Family Clinic mails Summit Valley a referral for Elena Marsh with two attachments. Both appear under **What
arrived** as **Taken**: `referral-SV-000117.pdf` becomes a **Referral** document and the scanned second page a
**Wound assessment form**. Greta Fischer in health information checks them in **Review › Documents**.
