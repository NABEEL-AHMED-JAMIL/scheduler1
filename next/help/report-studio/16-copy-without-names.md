---
id: rs-copy-without-names
title: A copy without names
summary: A version of a report with the patient's details taken out — names, record numbers, dates of birth, the dates shifted — for a quality board or a partner that does not need to know who.
section: Manage
who: Reports to download a copy; Edit templates to say which fields are personal
where: A report's Download menu (/reports/library); the designer's page settings
related: rs-versions, rs-designer, rs-schedules, rs-pdf-archive
---
A **copy without names** is the same report with what identifies the patient taken out: the minimum necessary for a
quality board, an audit or a partner. It is made from the version's own frozen data, so it matches the report exactly
except for the personal details, and every page says **DE-IDENTIFIED COPY**.

It is never a new version of the report and is never signed: the approved, signed report stays the record. Its file is
not one the verify page knows, so a copy handed to [the verify page](#rs-approve--verify-a-signed-pdf) answers that it does
not match the original.

## Say which fields are personal
A copy can only take out what the template says is personal. Nothing is guessed from a field's name.

1. Open the template's draft in the designer and click an empty part of the page to see the **page settings**.
2. Under **Personal data**, tick each field that identifies a person: a name, a medical record number, a date of birth,
   an address, a phone number.
3. For each, choose what a copy prints instead: **A pseudonym** (the field's name and a number, such as *Patient 3*; the
   default), **Masked** (•••), **The year only** (the default for a date) or **Left out**.
4. **Other dates in a copy without names**: **Shifted by the same days** (the default: every other date moves by the same
   number of days, chosen for each copy and never shown, so the time between two visits stays true), **The year only**,
   or **Kept as they are**.
5. **Also replace names and dates written in notes and summaries** (on by default): a note or an AI summary that names
   the patient, or their record number, gets the same pseudonym; a date written in it moves with the others.
6. Publish the template. Reports made from that version can have a copy.

A picture that may identify the person (a face, a tattoo) is left out of a copy when you tick **May identify the person**
on the picture (or on a table's picture column). Wound pictures are kept unless you tick it. A QR code or barcode that
would find the report prints that this is a copy; a signature says the copy is not signed.

The same fields are hidden as ••• in [Compare versions](#rs-versions--compare-two-versions) from anyone without **See
personal data**.

## Download a copy
Open the report and choose **Download** › **Copy without names · PDF** (or **HTML**). The first time, the copy is made
(a few seconds); after that the same copy is downloaded. Anyone who may download the report may download its copy; a
report from a sensitive pipeline also needs **Download sensitive files**, as the report itself does. Each download is in
the report's **Activity**.

If the menu says **Copy without names: not set up in the template**, the template has no personal fields yet: ask
someone who edits templates to tick them and publish, then generate the report again.

## On a schedule
A [report schedule](#rs-schedules) can also deliver a copy: tick **Also a version without names** in step 5. Once a
report is approved, its copy is made and kept with it, and saved in the bucket folder beside the signed PDF, named
*RPT-0042-v1-DEIDENTIFIED.pdf*. The schedule's checks say if its template has no personal fields.

## Good to know
- What a copy changed is counted on the report (personal values replaced, mentions in text, dates shifted).
- A copy is billed once as a report generated; downloading it again is not.
- A copy goes when the version's files go (the workspace's retention), and with the report when it is deleted.
- Ages, diagnoses and measurements are kept: they are what the copy is for.

## Example
A wound clinic sends its monthly wound report to the regional quality board. In the template, *Patient*, *MRN* and
*Date of birth* are ticked as personal; dates are shifted. The board's copy reads *Patient 1 … Patient 6*, *MRN 1 …*,
*1958* for a date of birth, and *Mrs Patient 1 was discharged home* in the course notes; the wound pictures and every
measurement are as in the signed report.
