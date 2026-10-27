---
id: form-submissions
title: Submissions
summary: What each form collected, who sent it and when, the run and the approval it started, its answers, files and signatures.
section: Submissions
who: Anyone whose page access includes Submissions
where: Forms › Submissions (/forms/submissions)
related: form-starts, form-dataset, form-build, doc-intake
popular: See what a form collected
---
**Get data in › Forms › Submissions** shows what a form collected: who sent each submission and when, whether it
started the form's pipeline, where its approval stands, and its answers.

![The Expense claim's submissions](form-submissions "Submissions: who sent each one, the run it started, its approval and stage")

## Find a submission
1. Open **Get data in › Forms › Submissions**, or choose **Submissions** in a form's row menu.
2. Pick the form in the list at the top right.
3. Narrow the list with **State** and **Search submissions…**.

The tiles count the **Submissions** and, for a form with an approval workflow, how many are **Awaiting approval**,
**Approved** and **Overdue** (with how many were rejected).

| Column | Says |
|---|---|
| **#** | The submission's number |
| **Submitted by**, **Submitted** | Who sent it and when |
| **Status** | **Received**, **Run started** #N (a link to the run's log) or **Run not started** |
| **Stage**, **Approval** | For a form with a workflow: the stage it is at and its status, with **Open request** |
| **Details** | Where the submission is stored, or why its run did not start, or the reason it was rejected |
| **Answers** | **View** |

Next to the form's name, **Fill in** opens the form, and **Open in Analytics Studio** opens its dataset when it keeps
one.

## Read a submission
Choose **View** on its row. The answers open under it, each under its field's label:

- a **Table** answer as a table, with its columns;
- **File upload** and **Signature** answers as the files they are, each by name;
- the rest as text.

The line under the answers says which version of the form was answered; the answers are shown with that version's
fields, even if the form has changed since.

![A submission's answers](form-submission "A submission opened: the claimant and each line of the claim")

## Read an attached file as a document
On a file answer, choose **Read with Document Intelligence** to send it to be read and extracted as a document. It then
says **Being read — open Document Intelligence**. You need page access to Documents for this.

## Export
**Export CSV** downloads every submission of the form, one row each.

> **Note:** The list shows the newest 200 submissions. When a form has more, the page says so; search and the tiles
> cover the 200 shown, and **Export CSV** has every submission.

## Example
Kevin Lee has sent two expense claims. Submission 1107 started run #2014 and is **Approved**; 1103 started run #1984
and is **Pending** at **Manager approves**, waiting for Claire Martin. Opening 1107 shows his four lines: a taxi to the
Peoria clinic, parking, a lunch and a train.
