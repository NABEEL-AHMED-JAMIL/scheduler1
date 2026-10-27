---
id: ts-approvals
title: Approvals
summary: An approval rejected or expired, a rejection that needs a reason, a task that is overdue, your own request, and items bulk approve skipped.
section: By message
who: Approvers, and whoever follows the runs and requests that wait on them
where: Run & review › Review › Approvals (/review/approvals); Run & review › Review › All waiting (/review/all)
related: ts-runs, ts-documents, ts-faq
---
A person's decision can stop a run or end a request, and a decision that never comes can too. These are the messages
you meet around approvals, and what each means.

## A rejected approval
**The message**, on the failed step and the run: `Rejected by Claire Martin (user 1054): Every line unmatched: the match
itself needs a look before approval.` The steps after it read "Skipped: step <name> was not approved.", and
**Runs › Failed** groups it as **Rejected by a reviewer**.

**Why:** an **Approval** step in the pipeline was rejected. The words after the name are the reviewer's own reason, or
"no reason given".

**Fix:** deal with what the reviewer asked (here, check the matching), then on the run's page **Retry from step N**
runs the Approval step again and asks for a new decision.

![A run stopped by a rejected approval](ts-rejected "The finance approver rejected the unmatched lines with a reason: the run failed and names who and why")

## An approval that expired
**The message:** `No decision by <time>: the approval request expired.`, with the time the request ran out.

**Why:** the Approval step's **Decide within (hours)** (1 to 720) passed with no decision. The run fails as if it had
been rejected.

**Fix:** retry from the step to ask again, and give the reviewers more time, or make sure someone is in the team the
step names (**Reviewers are** a role or a team).

## A rejection that needs a reason
**Why:** the workflow's step is set so that **A rejection needs a reason**. The comment box says so: "Comment: say why,
if you reject it (required)".

**Fix:** write the reason in the comment, then **Reject**. **Ask for changes** always needs a comment saying what should
change.

## Due soon and overdue
- "Due soon: <task>" and ""<title>" is still waiting for you, and is due on <date>." reach the approver before a task's
  due time.
- "Overdue, now yours: <task>" and ""<title>" passed its due time and has come to you." reach whoever the step sends an
  overdue task to (**When overdue, it goes to**, such as the requester's manager).
- In **Review › Approvals** an overdue task is marked **Overdue** ("Overdue · was due <time>"), and **Review › All
  waiting** lists overdue items first.

**Fix:** decide it, or **Pass on** it to a colleague with a note: the task moves to them and the request's history
records who passed it.

## Your own request
No one may approve their own request. In a workspace where nobody else could decide it, the note says so and points to
**Administration › Users** to add a person who can.

## Items bulk approve skipped
When you approve or reject several items at once, you first see what will happen to each. An item that cannot be
decided in bulk is skipped with its reason:

| Reason shown | What it means |
|---|---|
| Already decided | Someone decided it after the list was loaded |
| Not yours to decide | It waits for someone else |
| The pipeline requires individual review | The pipeline is set to be reviewed one by one: open and decide it on its own |
| Bulk approve is off in this workspace | The workspace's data policies keep runs or documents out of bulk approve |
| The document's rules fail, and the workspace policy keeps those out of bulk approve | Open the document and check the rules it fails |
| Changed since it was listed | Refresh the list and decide again |

## Learn more
See [Approval steps inside a run](#apr-approval-steps), [Decide many at once](#apr-bulk) and
[Who decides](#apr-who-decides). More questions:
[Frequently asked questions](#ts-faq).
