---
id: rs-review-comments
title: Comments while reviewing
summary: Pin a comment to a place on a report's page or to a block, mention a colleague, reply, resolve, and send a version back with its open comments.
section: Approve and sign
who: Anyone who may open the report in Reports; resolving: the comment's author, an approver, the person who made the version or an administrator
where: Reports › Library (/reports/library)
related: rs-approve, rs-versions, rs-designer, rs-copy-without-names
---
A reviewer reading a report version can leave a **comment** on it: on a place of a page ("P-1077 area does not match the
photo"), or on a block of the report ("show the unit beside each value"). Comments are part of the review record, never
of the report: the version's PDF and HTML do not change for one, and they never print.

![Comments on a report](rs-comments "A report's pages with numbered comment pins, and its Comments tab with a thread")

## Comment on a place of the page
1. Open the report and the version you are reviewing.
2. Choose **Comment** in the viewer's toolbar, then click the place on the page. The **Comments** tab opens with that
   place ready.
3. Write the comment. To tell a colleague, choose them under **Mention someone**: they get a notice in the console and an
   email with a link to the comment. The email never holds the comment's words or anything of the patient.
4. Choose **Comment**. A numbered pin marks the place on the page; click it to open its thread.

## Comment on a block, or on the template
In the **Comments** tab choose **On a block** and pick the block (a table, a chart, a heading). Tick **About the template
(shows in the designer)** when the comment is about how the report is made rather than this patient's data: the
designer then lists it over the template's page for whoever fixes it ([Review comments about the
template](#rs-designer--review-comments-about-the-template)).

## Reply and resolve
Each thread has **Reply**. When it is dealt with, **Resolve** closes it (its author, an approver, the person who made
the version or a workspace administrator can). **Open** and **Resolved** in the tab switch between the two lists; a
resolved thread cannot be replied to: start a new comment instead. A comment's words are never edited or removed by
hand: they are the record of the review.

## Send back with the comments
**Send back…** on a version waiting for approval sends its open comments back with it. The person who asked for the
approval is told how many, with a link, and each comment shows **Sent back**. See [Approve, sign and
verify](#rs-approve--approve-and-sign).

## Who sees comments
- Comments are read exactly as the report is: by the people who may open it in **Reports**; a report from a sensitive
  pipeline also needs **Download sensitive files**. Another workspace never sees them.
- Comments often quote the report. A reader without **See personal data** gets the patient's details in them shown as
  •••, worked out on the server from the report's own data. Reading comments that hold personal details is recorded.
- Adding, resolving and sending back comments are in the report's audit trail (who and when, never the words).

## Good to know
- A version's comments go when the workspace's retention removes the version's files, and with the report when it is
  deleted. A version kept for any reason (current, approved or signed, waiting for approval, made by a run under a legal
  hold) keeps its comments.
- A report with comments cannot be deleted while a legal hold is on: archive it instead.
- Comments are not billed.
- A version has at most 500 comments; a comment is at most 2,000 characters and mentions at most 10 people.

## Example
Dr Rivera reviews *Wound assessment · P-1077 · week 44*, version 2. On page 2 she clicks **Comment** and the wound's
area, writes *Area does not match the photo; re-measure*, mentions the wound nurse, and comments on the *Lab values*
table, ticked **About the template**: *Show the unit beside each value*. She chooses **Send back…**: both comments go
back to the nurse who asked. The nurse re-measures, replies *Re-measured: 5.9 cm²*, and generates version 3; the template
owner sees the *Lab values* comment in the designer, adds the unit and resolves it.
