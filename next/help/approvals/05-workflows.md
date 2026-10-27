---
id: apr-workflows
title: Design an approval workflow
summary: The designer's steps (approvals, tasks, conditions, notifications, Run pipeline, Call API, Save to dataset, Wait), deadlines, reminders and escalation, publishing and versions.
section: Approval workflows
who: Workspace administrators design, publish and test workflows; anyone whose page access includes Approval workflows reads them
where: Build › Approval workflows (/workflows/designer)
related: apr-who-decides, apr-my-requests, apr-approval-steps, apr-run-review
popular: Build an approval workflow
---
An **approval workflow** lays out who approves, what is checked and what runs, step by step, for a kind of request: a
purchase, a leave request, a bed request, or a whole patient's journey. A request is started by a person, a form, a
pipeline or the API, and walks the workflow's steps; its history records every decision.

![The workflow designer](apr-designer "Build › Approval workflows: the Patient journey, an approval step selected, its settings on the right")

## Make a workflow
1. Open **Build › Approval workflows** and choose **New workflow**.
2. Give it a **Name**, a **Key** (how other screens and the API name it; it cannot change later), **What it approves** (a
   word for the thing requested: request, purchase, form) and a **Description**.
3. Choose **Create and design**. The canvas opens with **Request starts** and **Request ends**.
4. **Add a step**, pick its kind, and fill its settings on the right. **Up**, **Down** and **Add after** place it.
5. Choose **Publish version N** at the foot of the canvas, with an optional note of **What changed**.

## The kinds of step
| Step | What it does |
|---|---|
| **Approval** | Someone approves, rejects or asks for changes |
| **Task** | Someone does a piece of work and marks it done |
| **Condition** | Goes one of two ways on the request's fields |
| **Notify** | Tells someone, and goes on |
| **Run pipeline** | Starts a schedule's run |
| **Call API** | Sends a saved API request and keeps its answer to branch on |
| **Save to dataset** | Keeps the request as a row |
| **Wait** | Pauses for some hours |

## Approvals and tasks: deadlines, reminders, escalation
- **Who approves** (or **Who does it**): see [Who decides](#apr-who-decides).
- **Due in (hours)**: the deadline; blank is no due time. **Remind before (hours)** sends a reminder before it is due.
- **When overdue, it goes to**: whom an overdue task escalates to, by default the requester's manager.
- **A rejection needs a reason**, and **If rejected**: *The request ends, rejected*, or go to another step.
- **Keep the decision as** (optional): a name, such as `nurse`, under which the request keeps the decision. Later steps
  read `nurse.decision` (`approved`, `rejected` or `changes_requested`; `done` for a task), `nurse.byName` (who
  decided), `nurse.at` (when) and `nurse.comment` (their comment, empty when none): in a **Run pipeline** step's **Parameters** as `{{nurse.byName}}`, or in a **Condition** on
  `nurse.decision`. The request's **History** shows what was kept. The name cannot be one another step already keeps
  its outcome under.

## Conditions
Pick a **Field of the request** (such as `amount`, or a value an earlier step kept, such as `careplan.risk`), a **Test**
(*is*, *is not*, *is more than*, *is at least*, *is less than*, *is at most*, *contains*, *is one of*, *is filled in*,
*is empty*) and a **Value**, then **If yes, go to** and **If no, go to**.

## Run a pipeline, call an API
- **Run pipeline**: pick the **Schedule to run** and its **Parameters**, from the request by name (`{{subject.mrn}}`) or an
  earlier step's kept value. Tick **Wait until the run ends, its approvals included** to go on only when it is done; then
  **Keep how it ended as** a name a condition can read, and **Keep values from its answer** (fields of its final output,
  such as `risk`). **Give up after (hours)**, and **If it cannot start or does not complete**: **Stop the request** or
  **Carry on**.
- **Call API**: pick a saved request from **Connections › API collections** (its secrets stay there), the **Environment**,
  the **Variables** and **Keep the answer as**; **If the call is not ok**: stop, or carry on and branch on the answer.
- **Save to dataset**: the **Dataset** the request is kept in, a row per request.
- **Wait**: the **Hours** to pause.
- At **Request ends**, **If the request ends here, it ends as**: *As its latest approval went*, *Approved*, *Rejected*,
  *Completed* or *Failed*.

## Publish, versions and test runs
- A change stays a draft until you publish it: *Version 5 is live. A change here stays a draft until you publish it.*
- Publishing makes a new version. Requests already running keep the version they started on.
- **Versions** lists each published version, the current one marked; **Load into the draft** starts from an older one.
- **Test run** starts a real request on the current version, as you, with a **Title**, a **Reference** and the request's
  fields as JSON. Its tasks go to the people the steps name.
- **Make inactive** stops new requests; **Make active** allows them again.

![A workflow's versions](apr-versions "The Versions tab: each published version, the current one marked")

> **Note:** Five workflows are **Built in**, made by the platform for features that rely on them: *Data access request*,
> *Pipeline run review*, *Pipeline step approval*, *Report approval* and *Signature or stamp approval*. Your workspace may
> still change them.

> **Tip:** Pass the approver to a report: Riverside Health's *Patient intake · intake review* keeps the nurse's approval
> as `nurse`, then runs the summary pipeline with `reviewed_by` = `{{nurse.byName}}`, `reviewed_at` = `{{nurse.at}}` and
> `review_note` = `{{nurse.comment}}`, so the signed PDF names who reviewed it. See
> [Patient intake](#rcp-patient-intake--7-the-approval-workflow).

## Example
Summit Valley's *Patient journey* has 16 steps: run *Registration*, a condition on `registration.eligible`, a nurse
triage task for Ward 4B nursing, run the *Care-plan draft* and keep `careplan`, the attending physician's approval (due in
4 hours, a reminder 2 hours before), a condition *High risk in the care plan* that asks a senior physician too, the medication
safety check, discharge and the signed discharge packet, and a row in the *journey-stages* dataset. Version 5 is live; a
patient admitted on version 1 finished on version 1.

## Limits
| What | Limit |
|---|---|
| Values kept from a pipeline's answer | Up to 16 KB; masked columns stay masked |
| Who designs and publishes | A workspace administrator |
| A workflow's key | Cannot change after it is made |
