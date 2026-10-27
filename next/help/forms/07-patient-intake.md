---
id: form-patient-intake
title: "Patient intake: from the front desk to a signed summary"
summary: Fill in a new patient's intake (or scan a paper one), follow it in My requests, review the AI's DRAFT summary as a nurse, and read the signed Patient intake summary.
section: Submissions
who: The front desk (or the patient) fills the form; nurses in the reviewing team approve; a workspace administrator decides high-priority intakes as the senior nurse
where: Get data in › Forms (/forms/builder); Run & review › My requests (/review/requests); Run & review › Review › Approvals (/review/approvals); Get data in › Documents › Intake (/documents/intake); See results › Reports › Library (/reports/library)
related: rcp-patient-intake, form-build, form-submissions, apr-my-requests, apr-approval-steps, doc-intake, doc-review, rs-approve, qa-intake
popular: Take a new patient's intake
---
A new patient's intake is typed in once, at the front desk or by the patient, on the form **New patient intake**, or
arrives as a scanned paper form. Each intake is then checked, summarised by AI as a DRAFT, reviewed by a nurse, and
kept as a signed **Patient intake summary** PDF that anyone with the report can verify. This article is for the people
who use it; the administrator who builds it follows the recipe
[Patient intake: a form in sections, an AI draft, a nurse's approval and a signed summary](#rcp-patient-intake).

> **Note:** Not yet verified end to end. This describes Riverside Health's intake as it was built on 26 October 2026,
> before its review workflow was published and before any intake had run through the whole road.

## Fill in an intake (front desk)
1. Open **Get data in › Forms** and choose **New patient intake**.
2. Work down the sections, each under its own heading: **Patient**, **Parent or guardian (patients under 18)**,
   **Emergency contact**, **Insurance**, **This visit**, **Medical history**, **Social history**, **Medicines, allergies
   and vaccines**, **Review of systems**, **Women's health**, **Care team** and **Consents and signature**.
3. The grey example text in each empty box shows the format: date of birth `e.g. 1980-04-12`, phone
   `e.g. +1 555 0100`, member ID `As on the card, e.g. PMH-448812`. It is not an answer; type over it.
4. Medicines, allergies, conditions, operations, family history and vaccines are tables: choose **Add row** for each
   one, and **Remove** to take a row out. A medicine needs its name; an allergy, what the patient is allergic to.
5. **Do you have any of these now?** is a list to tick: tick every symptom the patient has now, and leave the rest.
6. Some questions appear only when they apply. Answer **Is the patient under 18?** **Yes** and the guardian's name,
   relationship and phone appear, and are required. **Women's health** appears only when **Sex** is **Female**, and
   **Packs a day** only when tobacco is **Current**.
7. Required answers are marked. The patient (or the guardian) ticks the three consents, signs in the box with a mouse, a
   finger or a pen, and chooses **Use this signature** (**Clear** starts again). Type the **Name of the person signing**
   and the **Date signed**.
8. Choose **Submit**. The page says **Submitted** with the submission's number; **Fill in another** starts a new one.

If an answer needs attention the form is not sent: the page says so, and the field says why.

![The intake form](intake-form-fill "New patient intake: the Patient section, example text in each empty box, required answers marked")

> **Tip:** Leave a question empty rather than guessing. The summary lists what was not given under *Missing information to
> ask*, so the nurse asks the patient.

## After you submit
Each intake starts a request in the workflow **Patient intake · intake review**. Follow it in **Review › My
requests**: its state, and in **History** each step as it happens.

1. **Assess.** The answers are checked: the required ones are there, the date of birth gives a real age, the phone has at
   least 7 digits, the e-mail looks like one. The age and the BMI are worked out. Rules (not the AI) flag high-risk
   medicines (anticoagulants and antiplatelets, insulin, opioids, methotrexate, digoxin, lithium), a drug or severe
   allergy, smoking, a pregnancy, a child, and worrying symptoms (chest pain, shortness of breath, dizziness or fainting,
   a fall). Then a text model drafts a summary of 4 to 6 sentences, its own flags, a suggested triage priority (high,
   medium or low) with the reasons, and the missing information to ask about.
2. **Nurse review.** The nurses' team gets an approval. A rejection, with its reason, ends the request: no summary is made.
3. **High priority.** When the suggested priority is high, a senior nurse (a workspace administrator) decides as well.
4. **The summary.** The **Patient intake summary** PDF is made, and the intake is kept as JSON beside it.

A check that fails does not stop the intake: it goes on, flagged, and the summary shows it under *Checks that failed*.

## Review an intake (nurse)
1. Open **Run & review › Review › Approvals**. The intake's approval is under your team.
2. Open it. Read the DRAFT summary, the suggested priority and why, and the flags against the patient's own answers.
3. **Approve** with a short note, or **Reject** with the reason (a reason is required). Your name, the time and your note
   are what the summary prints under *Nurse's review*.

> **Warning:** The AI's summary, flags and priority are a DRAFT to help you read the intake quickly. They are never a
> diagnosis or a triage decision: you decide, from the patient's answers.

## The Patient intake summary
The report opens in **See results › Reports › Library** as **Patient intake · S-<number>** (a typed intake) or **D-<number>**
(a scanned one). Its parts, each kept whole on a page:

- the patient: date of birth and age, sex, language, the phone **masked to its last 4 digits**, primary care and
  pharmacy, the guardian for a child, the emergency contact;
- the reason for the visit, how long, pain, height, weight and BMI;
- the **Intake summary**: the suggested priority as a red, amber or green chip, the summary, and the line *Drafted with
  AI from the patient's own answers (a DRAFT, not a diagnosis); reviewed by* the nurse *on* the date; why this priority;
- **Flags**: allergies as red chips with their reactions, high-risk medicines found by the rules, the drafted flags;
- tables of the medicines, the allergies and reactions, conditions, operations, family history and vaccines; social
  history; the symptoms ticked (positives only); women's health for a female patient;
- insurance, with the member IDs **masked**; the consents and who signed;
- **Missing information to ask**; the **Nurse's review** with the signature and the approval stamp, the senior nurse when
  there was one, and a QR code to verify the report.

The PDF is signed when it is approved with **Approve and sign**: by someone other than the person who generated it.
**Verify signature** on its page, or the QR code, says whether it holds ([Approve and sign](#rs-approve)).


## A paper form
1. Open **Get data in › Documents › Intake**, **Upload**, and choose **Upload documents** with the scanned PDF.
2. The pages are read (OCR), the document is classified as **Patient intake · New patient intake form**, and every
   section is extracted: single answers as fields, medicines, allergies, history and the symptoms ticked as tables.
3. A reviewer checks it in **Run & review › Review › Documents** and approves it.
4. If it was matched to the wrong type, open **Documents in**, choose the document's menu (⋯) › **Extract again**, pick
   **Patient intake · New patient intake form**, and check it again ([Reading documents](#doc-reading)).
5. Approving starts the pipeline **Patient intake · from documents**: the same assessment for each intake, then one
   nurse's approval for the batch (up to 5 intakes that waited together), then a summary for each.

> **Note:** Riverside Health also has the starter type **Patient intake form**. With two intake types, a scan may be
> matched to the starter: that is when you choose the type and extract again.

## Who can do what
| Person | May |
|---|---|
| Front desk (profile *Front desk*) | Fill in forms, and follow their own requests in **My requests**. Nothing else: no submissions, runs or reports |
| A nurse in the reviewing team | Approve or reject intakes in **Review › Approvals**; review scanned forms in **Review › Documents** |
| A workspace administrator | The senior nurse's decision on a high-priority intake; builds and changes the form and its workflow |
| A viewer | Nothing of the intake |
| Another workspace | Nothing: the form, its requests, runs, documents and reports are this workspace's only |

## Example
At Riverside Health the front desk takes the intake of Ingrid Castellanos, 78, who felt dizzy standing up and fell at
home last week. She takes nine medicines, warfarin among them. The rules flag warfarin as a high-risk medicine and
*polypharmacy (9 medicines)*; the DRAFT suggests **high** priority ("fall with dizziness on warfarin"). The nurse
approves with "Fall on warfarin: told the doctor; check for head injury and INR today."; because the priority is high, a
senior nurse approves too. Her signed summary shows her phone masked to its last four digits, and under *Allergies and reactions*: "No known
allergies."
