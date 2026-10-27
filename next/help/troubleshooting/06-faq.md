---
id: ts-faq
title: Frequently asked questions
summary: About thirty questions people ask most, from a missing menu to a schedule that did not run, each with a short answer and where to read more.
section: Questions
who: Everyone
related: ts-runs, ts-approvals, ts-connections
popular: Why can't I see a page or a menu?
aliases: faq
---
Short answers to the questions people ask most. Each links the article that says more.

## Access and the menu

### Why can't I see the Billing menu?
Billing (Cost & usage, Analytics, Invoices and Billing documents) is for workspace administrators only; a member never
sees it, whatever their profile. Ask an administrator for what you need. See [Who sees what](#gs-who-sees-what).

### Why is a page missing from my menu, when a colleague has it?
A workspace member sees the pages their **Page access** profile opens; administrators see every page. Two people with
different profiles see different menus. See [Page access profiles](#adm-access-profiles).

### What does "… isn't part of your access" mean?
You opened a page your profile does not include, from a link or a bookmark. The page explains it and offers **Request
access**, which goes straight to your workspace administrators' notifications. A page for administrators only says
"This page isn't available to you" instead.

### Why does every change say "This workspace is managed by our team"?
Your workspace is run as a managed service: "This workspace is managed by our team, so this cannot be changed here.
Contact your account team to request the change." See [The managed service](#sec-managed).

### I lost the phone with my authenticator. How do I sign in?
Ask a workspace administrator: on **Administration › Users** they choose **Reset two-factor login** for you, and you set
it up again at your next sign-in. See [Two-factor sign-in](#gs-two-factor).

### Who may build pipelines?
Anyone whose profile includes Pipelines may read them; saving a pipeline is a workspace administrator's. See
[What a pipeline is](#pl-overview).

## Runs and schedules

### Why did my schedule not run?
Check, in this order:
1. The schedule is active, and its start date and time have come (and its end, if any, has not passed).
2. It runs **On a timetable**: a schedule set to **Only when started** runs only from **Run now** or a workflow.
3. Its last run had finished: a run due while the last one is still going is recorded as **Skip**.
4. The console was running: a run whose time passed while nothing was running to take it is recorded as **Missed**.

See [Run a pipeline on a timetable](#trg-schedules) and [Run statuses](#run-statuses).

### My cron schedule runs at the wrong hour. Why?
A cron expression is read in server time, Chicago, as the hint under the field says. `0 3 * * *` is 03:00 in Chicago.
See [Run a pipeline on a timetable](#trg-schedules).

### Why did my file not start the pipeline?
The schedule must have **A file arrives** ticked, and the file must land in the workspace inbox (Documents › Intake ›
File drop). A file that arrives while a run is going waits its turn. See [Start a pipeline when a file arrives](#trg-file).

### What is the difference between Retry from step N and Run again from the start?
**Retry from step N** runs the same run again from the failed step and reuses what the steps before it kept ("Reused
from attempt 1"). **Run again from the start** runs every step again. See [When a run or a step fails](#ts-runs--retry).

### How do I retry only the items that failed?
On the run's **Items** tab, choose **Retry failed items**: only the failed items run again, each from the step it
failed at. See [The Items view](#run-items).

### A run waits at "Waiting for approval". What now?
The pipeline has an Approval step: the run waits until a reviewer decides in **Review › Approvals**, or until the step's
time to decide runs out. See [Approval steps inside a run](#apr-approval-steps).

### Why was nothing done on a quiet day, and is it billed as a failure?
A scheduled read of only new files that finds none completes the run with no rows; it is not a failure. See
[Nothing new to do](#ts-runs--nothing-new-to-do).

### Where do I see what a run cost?
On the run's page, **What this run cost**. Administrators see every charge under **Billing › Cost & usage**. See
[What AI costs](#ai-costs).

### How long are a run's outputs kept?
The run's **Outputs** tab says, for each file, until when it is kept ("With the run · until …"). The workspace's
retention is set under **Administration › Data policies**. See [Retention](#sec-retention).

## Data, AI and privacy

### Can the console write to our database?
No. Database connections are read-only: pipelines read from them and write their results to files, buckets, reports,
webhooks and notifications. The Write Database step is listed in the Task Registry as unavailable. See
[Add a read-only database connection](#con-databases).

### Does the AI decide anything?
No. A model's answer is a draft for a person to check: pipelines mark it DRAFT, and a person approves or rejects it in
Review. A report is approved and signed by a person. See [AI in pipelines](#ai-steps).

### Which models may see our sensitive data?
That is the workspace's choice under **Administration › Data policies**. The Sensitive level starts as **Local only**:
only model connections your organisation runs itself may see it, until an administrator says otherwise. See
[Which models may see which data](#ai-data-levels).

### Does using the console make us compliant with HIPAA?
No product does that by itself. Meeting your organisation's privacy and regulatory obligations depends on how you
configure and use the console. See [Working with health data](#sec-health-data).

### Can someone outside our workspace fill in one of our forms?
Only through a link an administrator makes on purpose. Forms are shared inside the workspace, filled in by signed-in
members; **Share by link**, in the form's Settings, is off for the workspace until an administrator turns it on, and
each link has an expiry and may be limited to signed-in members. See [Share a form](#form-share).

## Approvals

### How do I give a colleague my approvals while I am away?
For one task, **Pass on** it in **Review › Approvals** to the person you pick. For a period, an **out of office** lets a
colleague decide your tasks, each decision recorded "for" you; the console has no page to set one yet. Sending approvals
to a team means anyone in it can decide. See [Out of office](#adm-out-of-office).

### Why can't I approve my own request or report?
No one may approve their own request, and a report version is approved by someone who did not generate it. Someone else
decides. See [Who decides](#apr-who-decides).

### Why did bulk approve skip some items?
Each skipped item says why, for example "The pipeline requires individual review": that pipeline's runs are decided one
by one. See [Items bulk approve skipped](#ts-approvals--items-bulk-approve-skipped).

### Why must I write a reason to reject?
The workflow's step asks for one (**A rejection needs a reason**), so the requester learns why. Asking for changes
always needs a comment. See [Approvals](#ts-approvals).

## Documents and reports

### I uploaded a document twice. Why is there only one?
The console keeps one document per file: the second upload says the file is already there and names the first. See
[The same document twice](#ts-documents--the-same-document-twice).

### Why was my report not made?
Most often it would have been longer than the workspace's page limit (300 pages unless set lower), or a field the
template needs is missing from the data. The message says which. See [A report over the page limit](#ts-documents--a-report-over-the-page-limit).

### How do I check that a PDF someone sent me is ours and unchanged?
On a report's page in **Reports › Library**, choose **Verify signature** and give it the file. See
[Discharge](#tour-discharge--check-the-signed-copy).

### Can I delete a report that was approved?
No. An approved report is a kept record: void the version, with a reason, or archive the report. A report never
approved can be deleted.

### A dashboard tile says "Nothing to read at …". Is the board broken?
No. The tile reads a file that is not there: "The connection worked, so check the path." Usually the pipeline that
writes it has not run yet. See [Where a board's data comes from](#dash-data-sources).

## Times and the API

### Which time zone are the times in?
The console uses a 24-hour clock. Where the zone matters it is named, as in "26 Oct 2026, 19:27 (Chicago)", and a cron
expression is read in server time (Chicago).

### Is the sandbox billed?
No. Test keys made under **API Clients › Sandbox** work only in the sandbox, and nothing there is billed. See
[The sandbox and test keys](#dev-sandbox).
