---
id: qa-people
title: "Test area 03: people, access and teams"
summary: Roles, page access profiles, a page opened or withheld for one person, delegates, teams and their leads, and what a member may not open.
section: Set up and access
who: Testers; most checks as the administrator (A), with R, V and F to see what changed
where: Administration › Users (/administration/users); Administration › Page access (/administration/access-profiles); Administration › Teams (/administration/teams)
related: adm-people, adm-access-profiles, adm-some-tabs, adm-delegates, adm-teams, gs-who-sees-what, qa-guide
popular: Check what each role may open
---
These checks cover who may open what: the two roles, page access profiles, a page or tab opened or withheld for one
person, delegates who grant access without being administrators, and teams. A page left out of someone's access is off
their menu, and the server refuses its data too, so several checks open a page by its address on purpose.

**Before you start:** the test accounts of [How to use this guide](#qa-guide), and one spare test member (called F2
below) you may deactivate. Changes to someone's access reach them at their next sign-in or when their session refreshes:
sign out and in again as that person before you judge a check.

Tested by ______ on ______

## Roles and people
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-03.01 | A person's page | As A, **Administration › Users**, F's row menu › **Edit** | F's page shows **Profile**, **Role and access**, **Sign-in security**, **Activity**, **Notifications** and **Danger zone** | ☐ Pass ☐ Fail |
| QA-03.02 | What they can see | On F's page, read **What they can see** under **Role and access** | It lists F's menu: **Home** and **Forms** only | ☐ Pass ☐ Fail |
| QA-03.03 | Nobody changes their own role | As A, open your own page on **Users** | Your own role cannot be changed: the choice is not offered, or saving it is refused | ☐ Pass ☐ Fail |
| QA-03.04 | Nobody removes their own account | As A, look for **Deactivate** and **Delete** on your own row and page | Neither works on your own account: not offered, or refused with a reason | ☐ Pass ☐ Fail |
| QA-03.05 | Deactivate keeps the account | As A, F2's row menu › **Deactivate**, confirm; try to sign in as F2 | F2's row reads **Inactive**; F2 cannot sign in; F2's work and history are still listed | ☐ Pass ☐ Fail |
| QA-03.06 | Activate brings it back | As A, F2's row menu › **Activate**; sign in as F2 | F2 signs in again, with the same profile as before | ☐ Pass ☐ Fail |
| QA-03.07 | Find people by standing | As A, choose the tiles **Active**, **Invited**, **Administrators** and **Members** in turn | Each filters the list to those people; the counts match the rows shown | ☐ Pass ☐ Fail |
| QA-03.08 | A member cannot open Users | As R, go to `/administration/users` | **This page isn't available to you** | ☐ Pass ☐ Fail |

## Page access profiles
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-03.09 | Make a profile | As A, **Administration › Page access** › **New profile**: **Profile name** `QA desk`, tick only **Forms** under **Pages this profile opens**; read **What this person will see**; **Create profile** | The preview shows **Home** and **Forms**; the new card is listed with 0 people | ☐ Pass ☐ Fail |
| QA-03.10 | Move a person onto it | On F2's page, **Page access profile** `QA desk`, **Save changes**; sign in as F2 | F2's menu holds **Home** and **Forms** only | ☐ Pass ☐ Fail |
| QA-03.11 | A held profile cannot be deleted | As A, `QA desk` card menu › **Delete** | It is refused while F2 holds it; after moving F2 back, **Delete** removes it | ☐ Pass ☐ Fail |
| QA-03.12 | A page outside your access | As F, go to `/runs/latest` | **… isn't part of your access**, naming F's profile, with **Request access** and **Dashboard** | ☐ Pass ☐ Fail |
| QA-03.13 | Request access reaches the administrators | On that page choose **Request access** | The button reads **Asked**; A's bell has a new notification naming F and the page | ☐ Pass ☐ Fail |
| QA-03.14 | Check a person | As A, **Page access** › **Check a person**, pick V | It lists V's pages (Runs › Analytics, Dashboards) and anything opened or withheld for V alone | ☐ Pass ☐ Fail |

![A page outside your access](qa-not-your-access "A member who follows a link to a page their profile leaves out: the page says so and offers Request access")

## One person's pages and tabs
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-03.15 | Open a tab for one person, for a while | As A, **Page access** › **Grant pages and tabs** › **A person**: **Person** V, **For** 7 days, **Reason** `QA check`; tick **Runs by date** under **Queue** | The change applies at once; after signing in again, V's **Runs** shows the **By date** tab | ☐ Pass ☐ Fail |
| QA-03.16 | Withhold a tab | Same panel, **Person** R: untick the **Failed** tab of **Queue**; sign in as R and go to `/runs/failed` | The tab is off R's **Runs**; the address is refused | ☐ Pass ☐ Fail |
| QA-03.17 | Every change is recorded | As A, **Grant pages and tabs** › **Changes** | QA-03.15 and 03.16 are listed with **When**, **Who** (A), **What** (**Opened a tab**, **Withheld a page** or a tab), the **Person**, **Until** and **Why** | ☐ Pass ☐ Fail |
| QA-03.18 | Back to their profile | **People × pages**: reset V's and R's exceptions | **Changes** lists **Back to their profile** for each; their menus are their profile's again | ☐ Pass ☐ Fail |

## Delegates
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-03.19 | Make a delegate | As A, **Grant pages and tabs** › **Delegates**: **Member who may grant** R, **To whom** **Only people I choose** (F), **For** 30 days, **Why** `QA check`; **Delegate** | The delegation is listed **Active** with its **Until** date | ☐ Pass ☐ Fail |
| QA-03.20 | What the delegate sees | Sign in as R, open **Administration › Page access** | Only **Grant access for the people you manage**, who delegated it and until when, **A person** and **Changes** | ☐ Pass ☐ Fail |
| QA-03.21 | A delegate's limits | As R, try to grant F a page R does not hold, and to grant something to A or to R | R can grant only to F and only pages R holds; a grant to A or to R is not possible | ☐ Pass ☐ Fail |
| QA-03.22 | End a delegation | As A, **End** on the delegation | It stops at once; **Changes** lists **Ended a delegation**; R's **Page access** is gone at R's next sign-in | ☐ Pass ☐ Fail |

## Teams
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-03.23 | Make a team with a lead | As A, **Administration › Teams** › **New team**: **Name** `QA team`; **Make team**; in its panel add R as **Lead** and F as **Member** | The panel lists both; the tiles count one more team and one more lead | ☐ Pass ☐ Fail |
| QA-03.24 | A lead manages the members | As R, **Review › Approvals** › **My teams** › **See who is in your teams**: remove F, add F again | Both work; the team panel shows the change | ☐ Pass ☐ Fail |
| QA-03.25 | A member cannot change a team | As F (a member, not the lead), try to add or remove someone in `QA team` | The change is not possible: only the lead and administrators change a team | ☐ Pass ☐ Fail |
| QA-03.26 | Teams open no pages | Compare F's menu before and after joining `QA team` | The menu is the same: teams do not open pages | ☐ Pass ☐ Fail |
| QA-03.27 | Where a team is used, and archiving | As A, **New team** `QA old team`; in its panel read **Where it is used**; **Archive team** | **Where it is used** is empty for a new team; the team moves to the archived ones (shown with the state filter). Keep `QA team`: later areas use it | ☐ Pass ☐ Fail |

## Another workspace
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-03.28 | Another workspace's people are not listed | As X, **Administration › Users**, search for R's and F's addresses | Neither is found | ☐ Pass ☐ Fail |
| QA-03.29 | Another workspace's profiles and teams are not listed | As X, **Page access** and **Teams** | Only X's own profiles and teams; `QA desk` and `QA team` are not there | ☐ Pass ☐ Fail |

## Example
At Summit Valley the tester opens **Runs › By date** for the viewer for seven days with the reason `QA check`, sees it in
the viewer's menu after signing in again, and finds the grant under **Changes** with her name and reason. Owen Wright,
HR's delegate, can move people between existing profiles but is never offered an administrator.
