---
id: rcp-approval-condition
title: "An approval workflow with a condition, a deadline, escalation and a stand-in"
summary: A care-plan sign-off where the attending physician approves within 4 hours (or it escalates to the team), a High risk adds the senior team, and a colleague can decide on the physician's behalf.
section: Building blocks
who: A workspace administrator designs and publishes the workflow; the people it names decide; anyone who may start it makes a request
where: Build › Approval workflows (/workflows/designer); Run & review › Review › Approvals (/review/approvals); Run & review › My requests (/review/requests)
related: apr-workflows, apr-who-decides, apr-my-requests, adm-out-of-office, rcp-team-run-review, rcp-journey-care-plan
popular: Add a second approval only when the risk is high
---
An approval workflow says who decides, by when, and what happens next. This one is small enough to build in ten
minutes and shows the four things most workflows need: a **deadline** with a reminder, **escalation** when nobody
decides in time, a **condition** that adds a second approval only when it matters, and decisions made **on behalf of**
someone who is away.

## What you'll build

A workflow, **Care plan sign-off** (key `care-plan-signoff`), with four steps:

1. **Approval** *Attending physician approves*: Dr. Anika Patel, due in **4** hours, a reminder **2** hours before,
   overdue to the **Physicians** team.
2. **Condition** *High risk?*: `risk` is `High` → step 3; otherwise step 4.
3. **Approval** *Senior physician approves*: the **Senior physicians** team, due in **8** hours.
4. **Notify** *Tell the requester*.

And two requests that take the two branches. Summit Valley's *Patient journey* has the same attending approval and
condition (on the care plan's own risk); its steps and a request's history are the figures.

## What you need first

- The teams **Physicians** (Dr. Anika Patel, Dr. Minh Nguyen, Dr. Chidi Okafor) and **Senior physicians** (Dr. Chidi
  Okafor): see [Make the teams](#rcp-team-run-review).
- Someone to start the requests who is not one of the approvers (the workspace administrator): no one approves their
  own request.
- The two test requests, with what each should do: [test-requests.csv](/help/samples/approval-condition/test-requests.csv).

## Build it

### The workflow

1. Open **Build › Approval workflows** and choose **New workflow**.
2. **Name** `Care plan sign-off`, **Key** `care-plan-signoff` (it cannot change later), **What it approves** `care plan`,
   **Description** `The attending physician signs off a care plan; a senior physician too when the risk is High.`
   **Create and design**.
3. **Add a step** → **Approval**. Set:

| Setting | Value |
|---|---|
| **Name** / **Key** | `Attending physician approves` / `attending` |
| **Who approves** | **A person**, Dr. Anika Patel |
| **Due in (hours)** | `4` |
| **Remind before (hours)** | `2` |
| **When overdue, it goes to** | **Everyone in a team**, Physicians |
| **A rejection needs a reason** | ticked |
| **If rejected** | **The request ends, rejected** |

4. **Add after** → **Condition**: **Name** `High risk?`, **Key** `high-risk`, **Field of the request** `risk`, **Test** **is**, **Value**
   `High`. Leave its branches for now.
5. **Add after** → **Approval**: **Name** `Senior physician approves`, **Key** `senior`, **Who approves** **Everyone in a team**, Senior
   physicians, **Due in (hours)** `8`, **A rejection needs a reason** ticked.
6. **Add after** → **Notify**: **Name** `Tell the requester`, **Key** `tell-requester`, **Tell** **The requester**, **Message**
   `The care plan for {{mrn}} is signed off.`
7. Select the condition again: **If yes, go to** *Senior physician approves*, **If no, go to** *Tell the requester*.
8. On *Tell the requester* (the last step), leave **If the request ends here, it ends as** at **As its latest approval
   went**.
9. Choose **Publish version 1**, with **What changed** `First version`.

![An approval step with a deadline and escalation](rcp-b-approval-step "Summit Valley's Patient journey: the attending physician's approval, a person, due in 4 hours, reminded 2 hours before, overdue to the Physicians team")

![The condition that adds the senior approval](rcp-b-condition "The condition: careplan.risk is High; yes to the senior physician, no to the medication check")

### Cover for someone who is away

An **out of office** lets a stand-in act on the tasks assigned to someone, for at most 90 days; every decision then
records both people. Dr. Patel names Dr. Minh Nguyen for the days she is away (she sets her own; an administrator may
set it for her). See [Out of office](#adm-out-of-office) for the rules.

> **Note:** There is no console page for setting an out of office yet; Summit Valley's was set by Dr. Patel through the
> platform. Until there is one, hand a single task over with **Pass on**: in **Review › Approvals**, open the task,
> choose **Pass on**, pick Dr. Nguyen under **Pass it to**, and choose **Pass on**. The history then says it was passed
> on, not decided for her.

## Check it worked

Start the two requests as the administrator: **Review › Approvals** → **My requests** → **New request**, **Workflow**
**Care plan sign-off**, and under **What it is about** **Add a field** for each value:

| Title | Fields |
|---|---|
| `Care plan · SV-000117` | `mrn` = `SV-000117`, `risk` = `High` |
| `Care plan · SV-000124` | `mrn` = `SV-000124`, `risk` = `Low` |

Choose **Start the request** for each. Then:

1. Dr. Patel (or Dr. Nguyen standing in) has two tasks in **Review › Approvals** → **Waiting for me**, each *due* 4 hours
   after it opened.
2. Approve **SV-000124**: its history says *high-risk: no* (conditions show by their key), then the notify step, and the request ends **Approved**.
   Nobody in Senior physicians is asked.
3. Approve **SV-000117**: *high-risk: yes*, and a task appears for Senior physicians under **My teams** for Dr. Okafor.
   When he approves, the request ends **Approved**, and you are told *The care plan for SV-000117 is signed off.*
4. Leave a third request undecided: 2 hours before it is due a reminder goes to Dr. Patel, and after 4 hours its history
   says *overdue, escalated to* the Physicians team, whose members now see it under **My teams**.
5. A decision made by a stand-in reads, in the request's **History**:

```A request's history
Attending physician approves: approved by Dr. Minh Nguyen (for Dr. Anika Patel)
```

![A decision made on someone's behalf](rcp-b-on-behalf "My requests at Summit Valley: Elena Marsh's journey, approved by Dr. Minh Nguyen (for Dr. Anika Patel), then high-risk: yes")

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| The senior approval is never asked | The field name or value does not match: the condition reads `risk`, the request has `Risk`, or `high` against `High`. Type them exactly. |
| Every request asks the senior team | **If no, go to** still points to the senior approval. Set it to *Tell the requester*. |
| *went to the administrators* in the history | The approver is the requester, or the team has nobody who can decide. No one approves their own request. |
| Nothing escalates | **Due in (hours)** is empty: no deadline, no reminder, no escalation. |
| A request still uses the old steps | It started on the earlier version. Requests keep the version they started on; new ones take the latest published. |
| The change has no effect | It is still a draft: choose **Publish version N**. |
| Dr. Nguyen sees nothing while Dr. Patel is away | No out of office covers those dates (it does not chain, and it ends when cancelled). Use **Pass on** for the task. |

> **Note:** Not yet verified end to end: *Care plan sign-off* itself was not run at Summit Valley. Its pieces were, in the
> *Patient journey* (request 2051): the 4-hour attending approval decided by Dr. Nguyen for Dr. Patel, the condition on
> a High risk, and the senior physician's approval. The reminder and escalation were not seen there, because every task
> was decided in time.
