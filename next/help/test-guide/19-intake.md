---
id: qa-intake
title: "Test area 19: patient intake"
summary: The New patient intake form (sections, show-when rules, required answers, checkboxes, tables, signature), its review workflow with a nurse and a senior nurse, the signed summary, scanned forms, the dashboard, roles and isolation.
section: Across the product
who: Testers; the front desk (F) fills in, the reviewer (R) is the nurse, the administrator (A) is the senior nurse and builds, with V and X for access and isolation
where: Get data in › Forms (/forms/builder); Run & review › My requests (/review/requests); Run & review › Review › Approvals (/review/approvals); Get data in › Documents › Intake (/documents/intake); See results › Reports › Library (/reports/library); See results › Dashboards (/data/analytics/dashboards)
related: form-patient-intake, rcp-patient-intake, form-build, form-logic, apr-workflows, rs-approve, doc-reading, qa-forms, qa-approvals, qa-reports, qa-guide
popular: Test the patient intake
---
These checks follow one new patient's intake the whole way: typed in at the front desk (or scanned on paper), checked,
summarised by AI as a DRAFT, approved by a nurse (and by a senior nurse when the priority is high), kept as a signed
**Patient intake summary**, and counted on the dashboard. They also test the form features the intake uses: sections,
answers that appear only when they apply, a **Checkboxes** field and its limits.

**Before you start:** the intake built as in [the recipe](#rcp-patient-intake); the accounts F (profile *Front desk*:
Forms and My requests only), R (in the nurses' team), A (an administrator, the senior nurse), V and X
([Prepare the test accounts](#qa-guide)). The sample files
[intake-answers-sample.json](/help/samples/patient-intake/intake-answers-sample.json) (Ingrid Castellanos, an adult),
[intake-child-sample.json](/help/samples/patient-intake/intake-child-sample.json) (Theo Brannigan, 7),
[intake-pregnancy-sample.json](/help/samples/patient-intake/intake-pregnancy-sample.json),
[intake-scanned-form-sample.pdf](/help/samples/patient-intake/intake-scanned-form-sample.pdf) and
[intake-test-cases.csv](/help/samples/patient-intake/intake-test-cases.csv) (the priority each case should get).
Synthetic patients only.

> **Note:** Not yet verified end to end. These checks were written while Riverside Health's intake was being built; run
> them once on a complete build and correct any expected result that differs.

Tested by ______ on ______

## The form
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-19.01 | Sections in order | As F, **Forms** › **New patient intake** | The fields stand under headings: Patient, Parent or guardian (patients under 18), Emergency contact, Insurance, This visit, Medical history, Social history, Medicines, allergies and vaccines, Review of systems, Care team, Consents and signature (Women's health only when Sex is Female); each heading once | ☐ Pass ☐ Fail |
| QA-19.02 | Example text | Look at **Date of birth** and **Mobile phone** while empty; type in one | They show `e.g. 1980-04-12` and `e.g. +1 555 0100` inside the box; the label stays; typing replaces the example | ☐ Pass ☐ Fail |
| QA-19.03 | An adult | **Is the patient under 18?** **No**, **Sex** **Male** | No guardian fields; no **Women's health** heading at all | ☐ Pass ☐ Fail |
| QA-19.04 | Under 18 | **Is the patient under 18?** **Yes** | **Parent or guardian's name**, **Relationship to the patient** and **Parent or guardian's phone** appear, marked required | ☐ Pass ☐ Fail |
| QA-19.05 | Under 18, guardian left empty | With **Yes**, leave the guardian fields empty; **Submit** | Not sent; each of the three says it is needed | ☐ Pass ☐ Fail |
| QA-19.06 | Back to adult | Fill the guardian's name, then answer **No** | The guardian fields disappear and the form can be sent without them; the submission keeps no guardian answer | ☐ Pass ☐ Fail |
| QA-19.07 | Women's health | **Sex** **Female**, then **Male** | **Women's health** (Pregnancy, First day of the last period) appears for Female and disappears for Male | ☐ Pass ☐ Fail |
| QA-19.08 | Packs a day | **Tobacco or nicotine** **Current**, then **Never** | **Packs a day** appears only for Current | ☐ Pass ☐ Fail |
| QA-19.09 | Required answers | Open a new form; **Submit** with nothing filled | Not sent. First name, last name, date of birth, sex, mobile phone, under 18?, date of the visit, main reason, the three consents, the signature, name of the person signing and date signed each say they are needed | ☐ Pass ☐ Fail |
| QA-19.10 | Tables | In **Medicines you take now** choose **Add row** twice; fill one, leave the other's **Medicine** empty; **Submit** | The empty row's Medicine is asked for; **Remove** takes the row away | ☐ Pass ☐ Fail |
| QA-19.11 | Tick all that apply | In **Do you have any of these now?** tick **Rash**, then **Cough**, then **Fever or chills** | All three stay ticked; nothing limits the number | ☐ Pass ☐ Fail |
| QA-19.12 | The signature | Sign in the box; **Clear**; sign again; **Use this signature** | **Clear** empties the box; after **Use this signature** the form keeps it and offers **Sign again** | ☐ Pass ☐ Fail |
| QA-19.13 | Submit an adult | Fill Ingrid Castellanos from the sample (adult, female, nine medicines, warfarin), sign, **Submit** | **Submitted** with a submission number; **Fill in another** offered | ☐ Pass ☐ Fail |

## Checkboxes limits (a test form)
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-19.14 | At least and At most | As A, **New form** `QA checkboxes`; add **Checkboxes (tick all that apply)** with options `Fever`, `Rash`, `Cough`; **At least** `1`, **At most** `2`; **Preview** | The field says **Tick 1 to 2** | ☐ Pass ☐ Fail |
| QA-19.15 | Too many | In **Preview** (or after **Save**, **Publish**, **Active**, as F) tick all three; **Submit** | Not sent: "Tick at most 2 (this has 3)." | ☐ Pass ☐ Fail |
| QA-19.16 | Limits that cannot hold | Set **At least** `4`; then **At least** `2` with **At most** `1`; **Save** | Refused: the least to tick is from 0 to 3 (its options); then the least to tick is more than the most | ☐ Pass ☐ Fail |
| QA-19.17 | A rule on a ticked option | Add a **Long text** `Rash details`, **Show only when** the checkboxes **is** `Rash` | It appears only while Rash is ticked; **is more than** is refused for a checkboxes field | ☐ Pass ☐ Fail |
| QA-19.18 | How the answer reads | Send one with Fever and Rash ticked; open **Forms › Submissions**, **View**; **Export CSV** | The answer reads `Fever, Rash`; the CSV cell reads `Fever; Rash` | ☐ Pass ☐ Fail |
| QA-19.19 | Sections in the builder | Give two fields **Section** `Part A`, the third `Part B`; choose the second field's **Section** box | The box suggests `Part A`; the canvas shows each heading once; moving a Part B field between the two Part A fields shows Part A twice | ☐ Pass ☐ Fail |

## Requests, review and the summary
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-19.20 | My requests | As F, **Review › My requests** after QA-19.13 | A request **Patient intake · intake review**, running; its **History** shows it was requested by F and a run was started | ☐ Pass ☐ Fail |
| QA-19.21 | The nurse's approval | When the assessment has run, as R open **Review › Approvals** | An approval for the nurses' team with the intake's patient, suggested priority, flags and DRAFT summary | ☐ Pass ☐ Fail |
| QA-19.22 | The rules' flags | Read the approval of Ingrid Castellanos | High-risk medicines: warfarin; also found by the rules: polypharmacy (9 medicines); suggested priority high (compare intake-test-cases.csv) | ☐ Pass ☐ Fail |
| QA-19.23 | The AI adds nothing | Compare the summary and flags with the answers | Every medicine and allergy the summary names is in the intake; none is invented; no diagnosis | ☐ Pass ☐ Fail |
| QA-19.24 | A high priority asks twice | As R approve Ingrid's intake with a note | A second approval, *A senior nurse decides the high-priority intake*, waits for the administrators; no report yet | ☐ Pass ☐ Fail |
| QA-19.25 | The senior's decision | As A approve it | The request is approved; **Reports › Library** gets **Patient intake · S-<number>** | ☐ Pass ☐ Fail |
| QA-19.26 | Not high: one approval | Send a low-priority case (P01 Lena Halvorsen); as R approve | No senior step; the report is made after R alone | ☐ Pass ☐ Fail |
| QA-19.27 | A rejection needs a reason | Send another intake; as R choose **Reject** with no reason, then with "Wrong patient" | Refused without a reason; with it, the request ends rejected | ☐ Pass ☐ Fail |
| QA-19.28 | A rejection makes no summary | After QA-19.27, look in **Reports › Library** and F's **My requests** | No report for that intake; F's request reads rejected with R's reason | ☐ Pass ☐ Fail |
| QA-19.29 | The kept decision | Open Ingrid's request **History**; open her PDF | The history shows what was kept of R's decision; the PDF's *Nurse's review* and the line under the summary name R and the time, with R's note | ☐ Pass ☐ Fail |
| QA-19.30 | Masking in the PDF | Read the PDF's patient and insurance parts | The phone, the emergency and guardian phones and both member IDs show only their last 4 characters | ☐ Pass ☐ Fail |
| QA-19.31 | The PDF's parts | Page through it | Each part is whole on a page; the DRAFT line *Drafted with AI … (a DRAFT, not a diagnosis)*; allergies as red chips; symptoms ticked only; *Missing information to ask*; a QR code | ☐ Pass ☐ Fail |
| QA-19.32 | Approve and sign, Verify | As R (who did not generate it) choose **Approve and sign**; then **Verify signature**; scan the QR code | The version reads **Signed**; the signature holds; the QR code opens the report's verification | ☐ Pass ☐ Fail |
| QA-19.33 | A bad phone goes on, flagged | Send an intake with phone `555-01` | The intake is not stopped; its summary lists the phone under *Checks that failed* | ☐ Pass ☐ Fail |
| QA-19.34 | A child's summary | Send the child sample (Theo Brannigan, 7) and approve | Flags include a child and the severe peanut allergy; the PDF shows the guardian; no Women's health part | ☐ Pass ☐ Fail |

## The dashboard
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-19.35 | Counts | As A open **Dashboards** › **Riverside — Patient intake** | **Intakes reviewed** counts the approved intakes (not the rejected one); **Each reviewed intake** lists them, newest first | ☐ Pass ☐ Fail |
| QA-19.36 | The mix and the rates | Read **Triage priority mix**, **High priority (%)**, **Missing-information rate (%)**, **Flags by type** | They match the intakes sent: Ingrid high, with an anticoagulant flag; the child counted under Child | ☐ Pass ☐ Fail |

## Scanned forms
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-19.37 | Upload a scan | As A, **Documents › Intake** › **Upload** › **Upload documents** with intake-scanned-form-sample.pdf | It arrives and is read; in **Documents in** it is typed **Patient intake · New patient intake form** with its tables | ☐ Pass ☐ Fail |
| QA-19.38 | The wrong type, then extract again | Its menu (⋯) › **Extract again**, **Document type** **Patient intake form** (the starter); then again with **Patient intake · New patient intake form** | The starter reads fewer fields and no medicine table; the right type reads every section again | ☐ Pass ☐ Fail |
| QA-19.39 | Approve the scan | As R, **Review › Documents**: check and approve it | A run of **Patient intake · from documents** starts and waits at the nurse's approval, *Patient intake: 1 scanned intake(s) to review* | ☐ Pass ☐ Fail |
| QA-19.40 | The scan's summary | Approve that run's approval in **Review › Approvals** | A report **Patient intake · D-<number>**; the dashboard's **Where the intakes came from** shows a scanned form | ☐ Pass ☐ Fail |

![Two intake types](intake-qa-two-types "Documents › Document types: the starter Patient intake form and Patient intake · New patient intake form, which starts Patient intake · from documents")

## Roles and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-19.41 | Front desk: the form only | As F look at the menu; open `/forms/submissions`, `/runs/latest`, `/reports/library` by address | The menu offers **Forms** and **Review**, where only **My requests** opens; each address says it is not open to them | ☐ Pass ☐ Fail |
| QA-19.42 | Front desk builds nothing | As F, **Forms** | No **New form**, no edit or row menu on **New patient intake** | ☐ Pass ☐ Fail |
| QA-19.43 | The nurse does not fill forms | As R (a profile without Forms) open `/forms/builder` | Not open to R; R still decides in **Review** | ☐ Pass ☐ Fail |
| QA-19.44 | Viewer sees nothing | As V open the form, Submissions, the runs of *Patient intake · assess*, Documents and the Library | Each is refused or empty of intakes | ☐ Pass ☐ Fail |
| QA-19.45 | Another workspace | As X open the form's fill address, the workflow, the template, the document type and a report's address copied from Riverside | Each is not found or refused; nothing of Riverside's shows | ☐ Pass ☐ Fail |

## Example
At Riverside Health the front desk sends Ingrid Castellanos's intake; the reviewer, as the nurse, approves it with a note,
and the administrator approves it again as the senior nurse because the DRAFT priority is high. The signed summary names
the reviewer under *Nurse's review*, masks her phone, and verifies. A second intake rejected for a wrong phone makes no
summary, and the Meridian administrator cannot open any of it.
