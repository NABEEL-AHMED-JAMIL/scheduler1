---
id: apr-my-requests
title: Start and follow a request
summary: New request from a published workflow, the request's details and history, asking for changes, and cancelling a request.
section: Approval workflows
who: Anyone whose page access includes the Task inbox; the workflows you may start are those an administrator published for people to start
where: Run & review › Review › Approvals (/review/approvals); Run & review › My requests (/review/requests)
related: apr-workflows, apr-who-decides, apr-review-home
---
A **request** is one walk through an approval workflow: a transfer to another hospital, a leave request, a capital
purchase. **My requests** lists what you asked for, newest first, and where each stands. Requests also start from a form
that names a workflow, from a pipeline, or from the API; they show here for whoever started them.

![My requests, one request open](apr-my-requests "My requests: a Hospice eligibility request, its details and its history")

## Start a request
1. Open **Review › Approvals** and its **My requests** tab, and choose **New request**.
2. Pick the **Workflow**. Only published, active workflows that a person may start are offered.
3. Give it a **Title**: what the request is, in a few words.
4. Under **What it is about**, **Add a field** for each value the workflow needs, as a name and a value
   (`amount` and `12500`, `patient.mrn` and `SV-000204`).
5. Choose **Start the request**. Its first step opens at once, and the people it names see a task in **Review**.

![New request](apr-new-request "New request: pick the workflow, give the request a title, add what it is about")

> **Tip:** A workflow that needs many fields is easier to start from a form: build the form in **Forms**, and say there which
> workflow its submissions start.

## Follow a request
Open the request in **My requests**:
- the header says its state (*Running*, *Approved*, *Rejected*, *Failed*, *Cancelled*), the workflow and its version, and
  when it started and ended;
- **Request details** shows what it is about;
- **History** says every step in words: *Requested by …*, *waiting for the team · due …*, *approved by …*, *yes* or *no*
  for a condition, *started run #2051* for a pipeline, *saved to dataset …*, *overdue, escalated to …*, *Request approved*.
  A decision's comment shows under it.

Search the list, or narrow it with **Any status** and **Any workflow**.

## When changes are asked for
An approver may **Ask for changes**, with a comment saying what should change. The request shows *Changes asked*; the history
carries the comment.

## Cancel a request
Open it and choose **Cancel request**, then confirm. The history says *Cancelled by* you, and its open tasks are no longer
needed.

## Example
Summit Valley's administrator starts *Hospice eligibility* for patient SV-000310, with the patient's record number as its
only field. In **My requests** the history shows *Gather the documents: done by Tamara Brooks*, then *A physician decides:
approved by Dr. Anika Patel*, each with its note, and *Request approved*.

## Limits
| What | Limit |
|---|---|
| Which workflows you may start | Published, active, this workspace's own, started by a person |
| Who decides your request | Never you: someone else, as the workflow names |
