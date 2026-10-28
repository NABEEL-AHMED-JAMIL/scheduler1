---
id: qa-approvals
title: "Test area 11: review and approval workflows"
summary: Everything waiting in Review, a run's review, Approval steps inside a run, individual and bulk decisions, approval workflows, requests, and who may decide.
section: Run and review
who: Testers; A builds, R and A2 decide, with V, F and X for access and isolation
where: Run & review › Review (/review/all); Run & review › Review › Approvals (/review/approvals); Run & review › My requests (/review/requests); Build › Approval workflows (/workflows/designer)
related: apr-review-home, apr-run-review, apr-approval-steps, apr-workflows, apr-who-decides, apr-my-requests, apr-bulk, ts-approvals
popular: Test an approval from start to decision
---
These checks cover every decision a person makes: a run's results waiting for review, an Approval step that pauses a
run, documents, and the requests of an approval workflow. Each decision is recorded under the name of the person who
made it, no one decides their own request, and a bulk decision is still one decision per item.

**Before you start:** the team `QA team` with R as its lead ([QA-03.23](#qa-people)), and `QA occupancy`
([QA-07](#qa-pipelines)). Leave **Administration › Data policies › Bulk review** at the workspace's usual setting and
note it.

Tested by ______ on ______

![Review › All waiting](qa-review-all "Review: approvals, runs and documents waiting together, with the kind, who it waits on and how long")

## Review, all in one place
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-11.01 | All waiting | As R, **Run & review › Review** | **All waiting** opens first, with **All**, **Approvals**, **Runs** and **Documents** and their counts; overdue first, then the longest waiting | ☐ Pass ☐ Fail |
| QA-11.02 | The badge matches | Compare the number beside **Review** in the menu with **All waiting** | They are the same | ☐ Pass ☐ Fail |
| QA-11.03 | Narrow by who it waits on | **Waits on**: **You**, then **Your teams** | Only what waits on R, then on R's teams | ☐ Pass ☐ Fail |
| QA-11.04 | Read one in the side panel | Click a row | What it is and what to check, with **Approve…** and **Reject…** when R may decide it there | ☐ Pass ☐ Fail |

## A run's review
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-11.05 | Turn review on | As A, `QA occupancy` › **Settings** › **Review**: tick **Our team**; **Save**; **Run now** | The run ends **Completed · waiting for review**; the Pipelines list's **Data** column says **Reviewed** | ☐ Pass ☐ Fail |
| QA-11.06 | Decide it | As the reviewer the review names (or A), open it from **Review**; read **What to review**; **Approve** with a note under **What you checked** | The run reads **Completed · approved**; the decision is recorded under the reviewer's name | ☐ Pass ☐ Fail |
| QA-11.07 | A rejection needs a reason | Run again; **Reject** with no reason, then with one, ticking **Run the schedule again** | Without a reason it cannot be sent; with one the run reads **Completed · rejected** and a new run is made | ☐ Pass ☐ Fail |
| QA-11.08 | A model's answer is marked DRAFT | Review a run of the AI pipeline of [QA-09.08](#qa-ai) with review on | The model's answer is marked **DRAFT**: made by a model for a person to check; not a decision | ☐ Pass ☐ Fail |
| QA-11.09 | A failed run has nothing to approve | Make a reviewed run fail; look for it in **Review › Runs** | It does not wait for review: only a completed run does | ☐ Pass ☐ Fail |
| QA-11.10 | Individual review stays out of bulk | Tick **Requires individual review**; **Save**; make two runs; in **Review**, tick both, **Approve** | Both are skipped with *The pipeline requires individual review* | ☐ Pass ☐ Fail |
| QA-11.11 | The workspace may forbid bulk approval of runs | As A, **Data policies** › **Bulk review**: **Allow bulk approve of runs** off; **Save review policy**; untick individual review; try a bulk approve | Each run is skipped with *Bulk approve is off in this workspace*; a bulk **Reject** still works. Put the policy back | ☐ Pass ☐ Fail |

## An Approval step inside a run
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-11.12 | The run pauses | As A, add **Approval** after **Filter**: **Task title** `QA wards {{rows}}`, **What to check** `Check the full wards`, **Reviewers** `QA team`; **Save**; **Run now** | The run reads **Running · waiting for approval**; R has a task in **Review › Approvals** with the **Pipeline**, **Run**, **Step**, **Rows waiting** and by when to decide | ☐ Pass ☐ Fail |
| QA-11.13 | Approve, and the run goes on | As R, **Approve** with a note | The run continues in a moment and completes; the step shows *Approved by* R | ☐ Pass ☐ Fail |
| QA-11.14 | Reject, and the run fails with the reason | Run again; as R, **Reject**, a reason, **Reject** again | The run fails; its message carries *Rejected by* R and the reason | ☐ Pass ☐ Fail |
| QA-11.15 | Pass a task on | Run again; as R, open the task › **Pass on**, **Pass it to** A2, a note; confirm | A2 has the task; its history says it was passed by R to A2 | ☐ Pass ☐ Fail |

## Approval workflows and requests
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-11.16 | Make a workflow | As A, **Build › Approval workflows** › **New workflow**: **Name** `QA purchase`, **Key** `qa-purchase`, **What it approves** `purchase`; **Create and design** | The canvas opens with **Request starts** and **Request ends** | ☐ Pass ☐ Fail |
| QA-11.17 | Steps and a condition | **Add a step** › **Condition**: **Field of the request** `amount`, **is more than** `1000`; yes: an **Approval** for **Everyone in a team** `QA team` with **A rejection needs a reason**; no: **Request ends** | The steps are placed; nothing is live until published | ☐ Pass ☐ Fail |
| QA-11.18 | Publish | **Publish version 1** with a note under **What changed** | **Versions** lists version 1 as current | ☐ Pass ☐ Fail |
| QA-11.19 | Start a request | As A2, **Review › Approvals** › **My requests** › **New request**: **Workflow** `QA purchase`, **Title** `QA laptop`, field `amount` = `2500`; **Start the request** | R has a task in **Review**; the request reads **Running** | ☐ Pass ☐ Fail |
| QA-11.20 | The condition decides the way | Start another with `amount` = `200` | It goes straight to its end; **History** shows *no* for the condition | ☐ Pass ☐ Fail |
| QA-11.21 | Ask for changes | As R, on the first request's task, **Ask for changes** with a comment | The request shows *Changes asked*; its history carries the comment | ☐ Pass ☐ Fail |
| QA-11.22 | Nobody decides their own request | As R, start a `QA purchase` request with `amount` `5000`; look at it in R's **Review** | It is listed but cannot be decided by R: someone else decides it | ☐ Pass ☐ Fail |
| QA-11.23 | Running requests keep their version | Change the workflow and **Publish version 2**; open a request started before | It still reads version 1 | ☐ Pass ☐ Fail |
| QA-11.24 | Cancel a request | As A2, open a running request › **Cancel request**, confirm | Its history says *Cancelled by* A2; its open task is gone from R's **Review** | ☐ Pass ☐ Fail |
| QA-11.25 | Make a workflow inactive | As A, **Make inactive** on `QA purchase`; as A2, **New request** | `QA purchase` is no longer offered | ☐ Pass ☐ Fail |

## Bulk, access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-11.26 | A wide bulk decision needs the count | As R, select more than 25 items that may be decided; **Approve** | The panel asks you to **Type N to confirm** | ☐ Pass ☐ Fail |
| QA-11.27 | A viewer and the front desk have no Review | As V and as F, go to `/review/all` | Refused | ☐ Pass ☐ Fail |
| QA-11.28 | Another workspace's Review | As X, **Review** | None of A's runs, tasks or requests is listed | ☐ Pass ☐ Fail |

## Request details
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-11.29 | A request's data reads in words | Open a request whose workflow ran a pipeline and kept an approval's decision (such as *Patient intake*), in **Approvals**, in **My requests** and from **Review**'s side panel | The pipeline is one line (its step, *Completed*, **Run #…**) with its values under it, no *Job ID*, *Give up at* or *Ok* rows; the decision reads *Approved by* and the person's name, then the day, month, year and 24-hour time with its comment as a quote; a long summary takes the width; a hidden value is a lock and ••• with *Hidden: personal data* | ☐ Pass ☐ Fail |
| QA-11.30 | A form's personal answers are hidden | As R (a profile without **See personal data**), open a *Patient intake* approval | Name, date of birth, phone, address and member IDs read as a lock and •••; the AI summary and comments show ••• where the name was; the bar says *Personal data is hidden for you*; there is no **Show** | ☐ Pass ☐ Fail |
| QA-11.31 | Show is for See personal data, and recorded | As A (or R after an administrator ticks **See personal data** on R's profile), open the same approval › **Show personal data** | The answers appear; **History** gains *Personal data shown to* A; **Hide** hides them again; a second **Show** within 15 minutes adds no second line | ☐ Pass ☐ Fail |
| QA-11.32 | The submitter sees their own | As F, open the intake you sent in **My requests** | Its personal data shows in full; the bar says *Your own request* | ☐ Pass ☐ Fail |
| QA-11.33 | Lists and notices hide it too | As R, look at the approval's title in the list and at its bell notice | Where a title holds a personal value it reads ••• | ☐ Pass ☐ Fail |
| QA-11.34 | The form's order, labels and sections | Open any *Patient intake* approval | What the steps kept (decisions, pipelines) comes first, then the answers under *Patient*, *Insurance*, *This visit* … in the form's order and with its labels (*Date of birth*, *Height (cm)*); a date reads *14 Feb 1942* | ☐ Pass ☐ Fail |

## Example
At Summit Valley **Controlled substance count reconciliation** pauses at its Approval step for Avi Cohen, the pharmacist,
and completes once he approves; **Bank statement matching** shows a rejection: the run failed with *Rejected by Claire
Martin: Every line unmatched*. Dr. Lena Schmidt's chest X-ray reviews require individual review, so a bulk approval skips
them.
