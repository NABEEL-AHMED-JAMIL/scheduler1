---
id: gs-who-sees-what
title: Who sees what
summary: Why two people see different menus: their role, their page access profile and anything opened for them alone.
section: Find your way
who: Everyone; administrators set it up under Administration › Page access
where: Administration › Page access (/administration/access-profiles); Administration › Users (/administration/users)
related: adm-access-profiles, adm-some-tabs, adm-people, gs-tour
---
The console shows each person only what their work needs. Two people in the same workspace can therefore see quite different menus, and the same page can show more to one than to the other. Three things decide it.

1. **Your role.** A **workspace administrator** opens every page of the workspace; page access does not apply to them. A **workspace member** opens the pages their profile gives them.
2. **Your page access profile.** A named bundle of pages, such as Reviewer, Clinician or Viewer. Members without a profile of their own get the workspace's default profile.
3. **Anything opened or withheld for you alone.** An administrator (or a delegate) can open a page or a tab for one person, for a while or until removed.

Home, **Your profile**, **My security** and **Notifications** are always open to everyone.

## Three menus side by side
![An administrator's menu](gs-menu-admin "Workspace administrator: every group")

![A reviewer's menu](gs-menu-reviewer "Reviewer profile: Forms, Runs, Review, Dashboards and Reports")

![A viewer's menu](gs-menu-viewer "Viewer profile: Runs (Analytics) and Dashboards")

| | Workspace administrator | Member on a Reviewer profile | Member on a Viewer profile |
|---|---|---|---|
| Home | Whole workspace | Their own schedules | Their own schedules |
| Get data in | Connections, Documents, Forms | Forms › Submissions | — |
| Build | Pipelines, AI Assistant, Approval workflows | — | — |
| Run & review | Runs, Review | Runs, Review | Runs › Analytics |
| See results | Dashboards, Analysis, Reports, Tools | Dashboards, Reports | Dashboards |
| Administration & billing | Administration, Billing, Settings, Developers | — | — |
| Decide approvals | Any run's review | What is assigned to them or their teams | — |

The Reviewer and Viewer columns show the profiles of the same names in this guide's example workspaces. Your workspace's profiles are whatever your administrators made: see [Page access profiles](#adm-access-profiles).

## What happens at a page you may not open
A page your access leaves out is off your menu. If you follow a link to it, the console says **… isn't part of your access** and offers **Request access**, which goes straight to your administrators' notifications. Hiding a page is only a courtesy: the server refuses the data behind it whatever the browser shows.

## Check what someone sees
Administrators can see a member's menu before they change anything:
- on **Administration › Page access**, choose **Check a person** and pick the member; or
- open the person on **Administration › Users**: **What they can see** lists their menu.

## Why my menu changed
- An administrator moved you to another profile, or opened or withheld a page for you.
- Something opened for you for a number of days has run out.
- Your workspace is managed by our team: an **Activity** tab appears for administrators.

Your menu follows the change from your next sign-in or when your session refreshes.
