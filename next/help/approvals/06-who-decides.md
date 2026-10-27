---
id: apr-who-decides
title: Who decides: people, roles, teams and managers
summary: A person, a role, a team or the requester's manager; team leads and members; passing a task on; decisions made for someone who is away.
section: Who decides
who: Workspace administrators make teams, name their leads and set managers; a team's lead adds and removes its members
where: Administration & billing › Administration › Teams (/administration/teams); Administration & billing › Administration › Users (/administration/users); Build › Approval workflows (/workflows/designer)
related: apr-workflows, apr-review-home, apr-approval-steps, apr-run-review
---
Each approval or task names who decides it. Name a team or a role rather than one person where you can: the work still
gets done when someone is busy or away, and the team's lead keeps its members current.

## The choices
In a workflow step's **Who approves** (or **Who does it**), and in **When overdue, it goes to**:

| Choice | Who gets the task |
|---|---|
| **The requester's manager** | The manager set on the requester's user, under **Administration › Users** |
| **The requester** | The person who started the request (for a task such as *add the receipts*) |
| **A person** | One named person |
| **Everyone with a role** | **Administrators** or **Any member** of the workspace |
| **Everyone in a team** | The members of a team |

![An approval step's Who approves](apr-approval-settings "An approval step's settings: Everyone with a role, Administrators, due in 48 hours, overdue to the requester's manager")

A step can also take its reviewers from what starts the request: a pipeline's run review asks the reviewers its settings
name.

> **Note:** No one approves their own request: someone else decides it. When a step's people cannot decide it, the request
> goes to the administrators, and its history says *went to the administrators*.

## Teams
1. Open **Administration & billing › Administration › Teams** and choose **New team**.
2. Give it a **Name** (such as *Wound care nurses*) and an optional **Description**, and choose **Make team**.
3. **Add a person** to add members. An administrator names the team's lead.
4. **Where it is used** shows the workflows, approvals, alerts and Report Studio approvals that name the team.
5. **Archive team** when it is no longer needed: nothing new goes to it, and its history keeps its name.

![Administration › Teams](apr-teams "Administration › Teams: each team with its lead, its members and where it is used")

- A team's **lead** adds and removes its members; an administrator names its leads. A team without a lead is changed only
  by an administrator.
- A person can be in many teams. Teams open no pages: page access does that.
- More on teams: [Teams](#adm-teams).

![Review › Approvals › My teams](apr-approvals "Review › Approvals › My teams: a task for the IT team, with Mark done and Pass on")
- In **Review › Approvals**, **My teams** lists the tasks of the teams you are in; **See who is in your teams** opens the
  team page.

## Managers
On a user's page under **Administration › Users**, **Manager** is whom their workflow approvals go to when a step says
*their manager*, and whom their overdue tasks escalate to.

## Pass a task on
In **Review › Approvals**, open the task, choose **Pass on**, pick the person in **Pass it to**, add a note if you like, and
confirm. The history says *passed by* you *to* them.

## When someone is away
A decision made for someone else shows both names in the request's history: *approved by Dr. Minh Nguyen (for Dr. Anika
Patel)*. How a stand-in is set, and its rules, are in [Out of office](#adm-out-of-office).

## Example
In Summit Valley's *Patient journey*, the attending physician's approval goes to **A person**, Dr. Anika Patel, with a
four-hour deadline; when she is away, Dr. Minh Nguyen decides for her. When the care plan's risk is *High*, a second
approval goes to the **Senior physicians** team, and the nurse triage task to **Ward 4B nursing**. Kevin Lee's
expense claims go to **The requester's manager**, Claire Martin, and escalate to her when overdue.

## Limits
| What | Limit |
|---|---|
| Who makes teams and names leads | A workspace administrator |
| Who changes a team's members | Its lead, or an administrator |
| Teams per person | Many |
