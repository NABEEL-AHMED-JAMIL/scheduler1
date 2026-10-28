---
id: form-build
title: Build a form
summary: Every field type, sections, required answers, placeholders and help text, a preview, and publishing so the workspace can fill it in.
section: Build and share
who: Workspace administrators build and change forms; anyone whose page access includes Forms fills in the Active ones
where: Forms › Forms (/forms/builder)
related: form-logic, form-share, form-starts, form-submissions
popular: Build a form
---
A form collects the same answers the same way every time: an admission, a triage, an expense claim, a work order. Each
submission is kept, and it can start a pipeline, an approval workflow, or both. Forms are built on **Get data in ›
Forms** and filled in by the workspace's own members.

![The forms list](form-list "Forms: each form's status, its fields, what it starts and how many submissions it has")

## Make a form
1. Open **Get data in › Forms** and choose **New form**. The editor opens on **Build**, with one field to start.
2. Choose **Settings** and give the form a **Name** (up to 120 characters) and a **Description**, shown above its
   fields.
3. Back on **Build**, add fields from the **Fields** palette on the left. Each one appears on the form in the middle.
4. Choose a field on the form to set it up on the right (below).
5. Use the arrows on a selected field to move it, or the bin to remove it.
6. Choose **Preview** to see the form as members see it; nothing is sent. **Back to editing** returns.
7. Choose **Save**, then **Publish** when it is ready. A published form says **Published** and its version.

![The form builder with a field selected](form-builder "The builder: the field palette, the form, and the selected field's settings")

## The field types
| Type | For | Its own settings |
|---|---|---|
| **Text** | A short answer: a name, an MRN | — |
| **Long text** | A paragraph: a reason, notes | — |
| **Number** | A weight, an amount, a score | — |
| **Date** | A date of birth, a visit date | — |
| **Choice** | One option from a list | **Options, one per line** |
| **Checkboxes (tick all that apply)** | Every option that applies: symptoms, services wanted | **Options, one per line**, **At least** and **At most** (each optional) |
| **Yes / no** | A yes or no question | — |
| **E-mail** | An e-mail address, checked as one | — |
| **Table** | Several rows: expense lines, medicines | **Columns** (each Text, Number, Date, Choice, Yes / no or E-mail, and **Required**), **At most** N rows |
| **File upload** | A letter, a photo, a receipt | **Accepted file types**, **Largest file (MB)**, **How many files**, **Send its files to Document Intelligence** |
| **Signature** | A signature drawn in a box | — |
| **Lookup** | One of the answers another form collected | **Offers the answers of** (the form) and **Field** |

## Set up a field
- **Label**: what the person reads, up to 120 characters.
- **Key**: the answer's name in the submission file: lower-case letters, digits and `_`, starting with a letter, up to
  40. A few names belong to the submission itself and cannot be used (such as `submitted_by`).
- **Type**: change it here if you picked the wrong one.
- **Required**: the form cannot be sent without it.
- **Personal data**: the answer identifies a person, such as a name, a date of birth, a phone, an address or a member ID.
  In the approval request a submission starts, it shows as a lock and •••, and so does that value wherever it appears in
  the request's text (an AI summary, a comment, the history). Only the person who sent the form, and people with
  **See personal data**, can show it. See [Personal data in a request](#apr-my-requests--personal-data-in-a-request).
- **Placeholder (optional)**: example text inside the empty box, such as `e.g. SV-000123`, up to 120 characters on one
  line. The label stays; people still see it. Text, long text, number, date, e-mail, choice and lookup fields take one.
  Left empty, the box shows a default for its type, such as "Enter case number" (greyed in the setting).
- **Help text (optional)**: a short hint shown under the field and read out with it, up to 500 characters.
- **Section (optional)**: the heading the field is shown under. See [Sections](#form-build--sections).
- **Add logic (show or require it when…)**: see [Show or require a field when](#form-logic).

> **Tip:** With **Send its files to Document Intelligence** on a **File upload** field, each PDF or image sent with the
> form also becomes a document, read and extracted against its type; the same file twice is kept once.

## Sections
A long form reads better in parts: *Patient*, *Insurance*, *This visit*. Give each field a **Section**; fields next to
each other with the same section are shown together under its heading, on the form, in **Preview** and on a share link.

1. Select the first field of the part and type its **Section**, such as `Insurance` (one line, up to 80 characters).
2. Select the next field: the box suggests the sections already used, so pick the same one.
3. Keep a section's fields together with the arrows. A field with another section (or none) between them starts the
   section again, under a second heading.

A field with no section is shown on its own, outside any heading. A section whose fields are all hidden by their rules
is not shown at all.

## Checkboxes
A **Checkboxes (tick all that apply)** field lists its options with a box each; people tick every one that applies.

- **Options, one per line**: each option once.
- **At least** and **At most** (optional): how many may be ticked, such as at most `3`. The form says it ("Tick 1 to
  3") and is not sent with too few or too many. **At least** applies once anything is ticked; tick **Required** to need
  at least one.
- The answer is the list of the options ticked, in the options' order. **Forms › Submissions** shows it as `Fever,
  Rash`, **Export CSV** joins it with `; ` (`Fever; Rash`), and the form's dataset keeps it as a list.
- In a rule ([Show or require a field when](#form-logic)), **is** `Rash` means "Rash is ticked", **is not** means it is
  not, and **is one of** means any of them is; **is answered** and **is not answered** work as for any field. **is more
  than** and **is less than** do not apply to it.

## Status
In **Settings**, **Status** is **Draft**, **Active** or **Archived**. Only an **Active** form takes submissions, and a
form needs at least one field to be Active. On the list, a row's menu (⋮) has **Activate** and **Archive**; **Show
archived** brings archived forms back into the list. Each saved change is a new version, and every submission records
the version it answered.

## Example
Summit Valley's **Admission intake** form has 15 fields and uses every field type. Among them: the patient's MRN (help text "SV- and
six digits", placeholder `e.g. SV-000123`), name, date of birth, sex and payer as choices, member ID, urgency, the
reason for admission as long text, weight, a contact e-mail, a yes / no for allergies, the referral letter as a PDF
upload, and a drawn consent signature.

## Limits
| What | Limit |
|---|---|
| Fields in a form | 50 |
| Label and form name | 120 characters |
| Placeholder | 120 characters, one line |
| Help text | 500 characters |
| Section | 80 characters, one line |
| Checkboxes | **At least** 0 to the number of options; **At most** 1 to the number of options |
| Table | Up to 20 columns; 1 to 200 rows (20 by default) |
| File upload | 1 to 25 MB a file (10 by default); 1 to 10 files (1 by default) |
| Who may build | Workspace administrators |
