---
id: form-dataset
title: The form's dataset and Rebuild dataset files
summary: A form's submissions as a dataset in Analytics, one row each, and how to write its files again when they are lost.
section: Submissions
who: Anyone with Submissions and Analytics opens the dataset; workspace administrators rebuild its files
where: Forms › Forms (/forms/builder); Forms › Submissions (/forms/submissions)
related: form-submissions, form-starts, con-storage
---
A form can keep its answers as a dataset: every submission is a row you can query, chart and put on a dashboard in
Analytics, next to the rest of your data. The rows are files in the workspace's own bucket, one file per submission.

## See where its dataset is
When a form keeps a dataset:

- the builder's line under the form's name says `saves to dataset Form: <name>`;
- its **Settings** tab, under **Dataset**, says "Every submission is a row of **Form: <name>** in Analytics" with the
  storage connection and the folder the files are in;
- on **Forms › Submissions**, **Open in Analytics Studio** opens it.

Each row holds the submission's answers and, for a form with an approval workflow, its approval status, stage and the
approver's reason.

![The Dataset part of a form's Settings](form-settings "Settings › Dataset: the dataset's name, connection and folder")

## Open it in Analytics
1. Open **Forms › Submissions** and pick the form.
2. Choose **Open in Analytics Studio**. The dataset opens there, ready to query.

## Rebuild dataset files
If the files in the bucket are lost (deleted by a clean-up, or the bucket was replaced), or were written by an older
version, the submissions themselves are still kept. An administrator can write the files again:

1. Open **Get data in › Forms**.
2. In the form's row menu (⋮), choose **Rebuild dataset files**.
3. Confirm with **Rebuild files**. The dialog says where the files are written.

Each submission's file is written again from the submission as it is kept, so Analytics reads every row. No answer
changes. The menu item says **Rebuilding files…** while it works; one form is rebuilt at a time.

> **Note:** A rebuild takes the newest 1,000 submissions.

> **Warning:** The rebuild writes into the bucket of the form's dataset. If a pipeline or a person edited those files,
> their changes are replaced by the kept submissions.

## Example
Summit Valley's **Expense claim** form saves to the dataset **Form: Expense claim**, kept in the
`summit-valley-s3` bucket. When a bucket clean-up removed last month's files, the finance board showed no claims for
October. The administrator chose **Rebuild dataset files** on the form, and the board's rows came back.
