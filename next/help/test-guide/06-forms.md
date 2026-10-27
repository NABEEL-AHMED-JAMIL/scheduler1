---
id: qa-forms
title: "Test area 06: forms and share links"
summary: Build, publish and fill in a form, show or require a field when, submissions and their export, what a submission starts, and share links with their limits.
section: Data in and build
who: Testers; the administrator (A) builds, the front desk (F) fills in, with R, V and X for access, share links and isolation
where: Forms › Forms (/forms/builder); Forms › Submissions (/forms/submissions)
related: form-build, form-logic, form-share, form-starts, form-submissions, form-dataset, trg-form, qa-guide
popular: Test a form's share link
---
These checks cover forms from both sides: the administrator who builds one and decides what a submission starts, and
the person at the front desk who only fills it in. They also cover **share links**: a link that opens one form for
someone who sees nothing else, with an expiry, a cap on submissions, and an option to require signing in.

**Before you start:** the front-desk account F (a profile that opens **Forms** only), and a private browser window with
nobody signed in, for the share-link checks. Use made-up answers only: a patient `Test Patient`, MRN `SV-000999`.

Tested by ______ on ______

## Build and publish
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-06.01 | Make a form | As A, **Forms** › **New form**; **Settings**: **Name** `QA intake`; on **Build** add **Text** (MRN, **Required**), **Choice** (Payer: `Self-pay`, `Medicare`, `Other`), **Text** (Member ID), **Yes / no** (Any allergies?), **Long text** (Allergies), **Signature**; **Save** | The form is saved as **Draft** with its six fields | ☐ Pass ☐ Fail |
| QA-06.02 | A field's key rules | Give a field the **Key** `submitted_by`, then `1mrn` | Both are refused: lower-case letters, digits and `_`, starting with a letter, and not a name the submission uses itself | ☐ Pass ☐ Fail |
| QA-06.03 | Show a field when | **Logic**: Allergies **Show only when** Any allergies? **is** **Yes**; Member ID **Also required when** Payer **is not** `Self-pay`; **Save** | The tab reads **Logic (2)**; on **Build** each of the two fields says it has a rule | ☐ Pass ☐ Fail |
| QA-06.04 | Preview the rules | **Preview**: answer Any allergies? **No**, then **Yes**; Payer `Self-pay`, then `Medicare` | Allergies appears only on **Yes**; Member ID becomes required only when the payer is not Self-pay; nothing is sent | ☐ Pass ☐ Fail |
| QA-06.05 | A draft takes no submissions | As F, open **Forms** | `QA intake` is not offered to fill in while it is a draft | ☐ Pass ☐ Fail |
| QA-06.06 | Publish and activate | As A, **Publish**; set **Status** **Active** in **Settings**; **Save** | The form reads **Published** with its version, and **Active** | ☐ Pass ☐ Fail |

## Fill in
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-06.07 | The front desk sees the active form | As F, open **Forms** | `QA intake` is listed and its name is a link; F's menu holds nothing but **Home** and **Forms** | ☐ Pass ☐ Fail |
| QA-06.08 | A required field stops the form | Open it; leave MRN empty; **Submit** | It is not sent; the MRN field says it is needed | ☐ Pass ☐ Fail |
| QA-06.09 | Sign and submit | Answer every field; sign in the box and choose **Use this signature**; **Submit** | The page says **Submitted**, with **Fill in another** | ☐ Pass ☐ Fail |
| QA-06.10 | The front desk cannot read submissions | As F, go to `/forms/submissions` | Refused (**… isn't part of your access**) | ☐ Pass ☐ Fail |
| QA-06.11 | The front desk cannot build | As F, look for **New form**, and try to open the form's builder | F cannot make or change a form | ☐ Pass ☐ Fail |

## Submissions and what they start
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-06.12 | The submission is listed | As A, **Forms › Submissions**, pick `QA intake` | A row with **Submitted by** F, the time, **Status** **Received** | ☐ Pass ☐ Fail |
| QA-06.13 | Read it | **View** on the row | Each answer under its label; the signature as a file; the line under the answers names the form's version | ☐ Pass ☐ Fail |
| QA-06.14 | An old submission keeps its version | Change the form (add a field), save; **View** the first submission again | It is still shown with the fields of the version it answered | ☐ Pass ☐ Fail |
| QA-06.15 | Export | **Export CSV** | Every submission of the form, one row each | ☐ Pass ☐ Fail |
| QA-06.16 | A submission starts a pipeline | In **Settings**, **When submitted, start**: a schedule **Only when started** (see [QA-08](#qa-triggers)); **Save**; as F, submit again | The forms list shows the schedule under **Starts**; the new submission's **Status** reads **Run started** #N, linked to its run | ☐ Pass ☐ Fail |
| QA-06.17 | A submission starts a workflow | In **Settings**, **Approval**: a published workflow (see [QA-11](#qa-approvals)); **Save**; submit again | The submission shows its **Stage** and **Approval** (**Pending**) with **Open request** | ☐ Pass ☐ Fail |

## Share links
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-06.18 | Sharing by link starts off | As A, the form's **Settings** › **Share by link** | It reads **Sharing by link is off for this workspace** | ☐ Pass ☐ Fail |
| QA-06.19 | Make a single-use link | Turn sharing on; **Label** `QA desk tablet`, **Works for** 1 day, **Submissions** **One (single use)**, **Only signed-in members** unticked; **Make link**; **Copy** | The link is shown once; the list shows it with **Status**, **Used** 0 and **Expires** | ☐ Pass ☐ Fail |
| QA-06.20 | The link opens the form and nothing else | In the private window (nobody signed in), open the link; fill in and submit | Only the form is shown, with no menu; it is sent; **Forms › Submissions** lists it | ☐ Pass ☐ Fail |
| QA-06.21 | A single-use link works once | Open the same link again | It no longer opens the form: **This link no longer works** (not yet verified) | ☐ Pass ☐ Fail |
| QA-06.22 | A link for signed-in members only | Make a link with **Only signed-in members** ticked; open it in the private window | **Sign in to fill this in** | ☐ Pass ☐ Fail |
| QA-06.23 | Another workspace's member cannot use it | Open that link signed in as X | **This form is for another workspace** | ☐ Pass ☐ Fail |
| QA-06.24 | Revoke a link | **Revoke** on a link; open it | **Link revoked.**; the link no longer opens the form (not yet verified: which message it shows) | ☐ Pass ☐ Fail |
| QA-06.25 | Sharing off stops every link | Turn sharing by link off; open any link of this workspace | No link opens the form; the setting says no link opens anything now | ☐ Pass ☐ Fail |

## Access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-06.26 | A viewer has no forms | As V, go to `/forms/builder` | Refused | ☐ Pass ☐ Fail |
| QA-06.27 | Another workspace cannot open the form | As A, copy the address of the form's **Fill in** page; as X, open it | **Form not found.** | ☐ Pass ☐ Fail |
| QA-06.28 | Rebuild dataset files | As A, if the form keeps a dataset: row menu › **Rebuild dataset files** › **Rebuild files** | The dialog says where the files are written; no answer changes | ☐ Pass ☐ Fail |

> **Privacy:** Do not use a share link without **Only signed-in members** for a form that asks for patient or personal
> data unless your organisation has approved it. In this test the answers are made up.

## Example
At Summit Valley the tester's front-desk account fills in `QA intake` with a made-up patient and signs it; Forms ›
Submissions lists it as **Received**, by name. A single-use link opened in a private window takes one submission, and
the Meridian administrator opening a signed-in-only link is told **This form is for another workspace**.
