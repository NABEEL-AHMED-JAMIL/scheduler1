---
id: adm-people
title: Add a person and choose their role
summary: Add someone to the workspace, pick Workspace member or Workspace administrator, give them a profile, and edit them later on their own page.
section: People
who: Workspace administrators
where: Administration › Users (/administration/users)
related: adm-reset-remove, adm-access-profiles, adm-teams, gs-sign-in, gs-who-sees-what
popular: Add a person
aliases: people
---
Everyone who signs in to your workspace is on **Administration › Users**. Each person has a **role**, which says how much they may do, and (for members) a **page access profile**, which says which pages they open. Roles are enforced on the server: they decide what a person can reach, not just what they see.

![Administration › Users](adm-users "Users: the people by standing at the top, then the table with role, access, last sign-in and state")

## The two roles
| Role | Opens | May change |
|---|---|---|
| **Workspace member** | The pages on their page access profile (or the workspace default) | Only what those pages allow: running, reviewing, reading |
| **Workspace administrator** | Every page of the workspace; page access does not apply | People, connections, pipelines, policies and settings |

Give someone the administrator role only when they look after the workspace itself.

## Add a person
1. Open **Administration › Users** and choose **New user**.
2. Under **Who and how they sign in**, type the **Full name** and the **Email**; the email is their sign-in.
3. Leave **Password** empty to have the console email them a one-time password. If you type one, it is not emailed: you pass it on yourself.
4. Under **Role and access**, pick the **Role**. For a member, pick their **Page access** profile, or leave **Workspace default**.
5. Under **About them**, add their **Position** (job title), their **Manager** and their **Phone** if you like. The manager is whom their workflow approvals go to when a step says "their manager", and whom their overdue tasks escalate to.
6. Choose **Create**.

![The New user dialog](adm-new-user "New user: who they are, their role and page access, and about them")

The person appears as **Invited** until they first sign in. At that sign-in they choose their own password, and set up two-factor sign-in if your workspace or their profile requires it.

## Find people
The tiles at the top count the people by standing (**Active**, **Deactivated**, **Invited**, **Locked**, **2FA on**, **2FA off**, **Single sign-on**, **Administrators**, **Members**, **Signed in · 30 days**, **Never signed in**); choose one to filter the list. Filter further by role (**All roles**), profile (**All access**) and state (**All states**), or search by name or email. **Table** and **Cards** show the same people.

## Edit a person
Choose **Edit** in a person's row menu (the three dots) to open their own page. It has six parts:
1. **Profile**: picture, name, email, position, manager and phone.
2. **Role and access**: the role, the **Page access profile**, their **Teams** (add or take them out), and **What they can see**, their menu as it will be after you save.
3. **Sign-in security**: whether two-factor is on, their last sign-in, their password and any lock, with **Reset password**, **Unlock** and **Reset two-factor login**, and the sessions they have open.
4. **Activity**: their recent sign-ins and the account's history.
5. **Notifications**: where the console's notices reach them, and who reports to them.
6. **Danger zone**: deactivate or delete the account.

Choose **Save changes** for the profile, role and access; the other parts act at once.

![A person's role and access](adm-user-access "Role and access: the role, the profile, the teams, and what they can see")

> **Note:** Nobody changes their own role, and the workspace is fixed once the account exists.

## Example
The Summit Valley admin adds Rosa Alvarez: **Full name** Rosa Alvarez, her work email, **Role** Workspace member, **Page access** Nurse, **Position** Charge nurse, Ward 4B. She is then added to the Ward 4B nursing team on her page. At her first sign-in she chooses her own password; had her profile required two-factor sign-in, she would set up her app then too.
