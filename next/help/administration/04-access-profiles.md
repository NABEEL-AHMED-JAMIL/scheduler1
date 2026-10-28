---
id: adm-access-profiles
title: Page access profiles
summary: Bundles of pages for members: whole pages or some of their tabs, the default profile, a custom profile, and requiring two-factor sign-in on a profile.
section: Access
who: Workspace administrators
where: Administration › Page access (/administration/access-profiles)
related: adm-some-tabs, adm-delegates, adm-people, gs-who-sees-what, gs-two-factor
popular: Make an access profile
---
A **page access profile** is a named bundle of pages for workspace members: Clinician, Nurse, Billing analyst, Viewer. Each member holds one; anyone without a profile of their own gets the workspace's **default** profile. Administrators always open everything, so profiles do not apply to them.

![Administration › Page access](adm-access-profiles "Page access: the profiles, who can open what, and Check a person")

## How it works
- A workspace with **no profiles** lets every member open every page, but for **See personal data**, **Download
  sensitive files** and the **Developer portal**: those are only ever given, on a profile or to one person. The first profile you make becomes the default, and everyone without one moves onto it.
- A profile opens **whole pages**, and for a page with tabs, **every tab or only some**.
- **Home**, **Your profile** and **Notifications** are always open; **Administration** stays administrator-only.
- On top of a profile, a page or tab can be opened or withheld **for one person**: see [Give a person only some tabs](#adm-some-tabs).
- A profile can **require two-factor sign-in** of the people on it.

The top of the page counts the **Profiles**, the **People assigned**, the **Default** and the **Pages** that can be granted. **Who can open what** explains how roles and profiles combine.

## Make an access profile
1. Open **Administration › Page access** and choose **New profile**.
2. Type the **Profile name** (for example Clinician) and a one-line **Description** of who it is for.
3. Tick **Default for this workspace** if members without a profile should get this one.
4. Tick **Require two-factor sign-in** if its people must use an authenticator app.
5. Under **Pages this profile opens**, tick the pages. They are grouped as the menu groups them, and each page lists the places on the menu it opens. Use the search box, **Chosen** and **Not chosen**, a group's checkbox, or a hub's **All** and **None** to go faster.
6. For a page with tabs, untick the tabs this profile should not open. A tab marked **hides the tab** has no data of its own: unticking it only hides it.
7. Where a page offers **Edit** beside it (such as dashboards), tick it to let the profile save, pin and delete there as well as read.
8. Check **What this person will see** on the right: the menu a member on this profile will have.
9. Choose **Create profile**.

![Editing the Clinician profile](adm-profile-editor "A profile: name, default, two-factor, the pages it opens, and what its people will see")

## Change or remove a profile
In a profile's menu (the three dots on its card):
- **Edit pages** opens it to change; choose **Save changes**.
- **Make default** makes it the workspace's default.
- **Delete** removes it. A profile someone holds cannot be deleted: move its people to another profile first.

Changes reach people at their next sign-in or when their session refreshes.

## Assign people to profiles
- When you add or edit a person on **Administration › Users**, pick their **Page access profile**.
- Or switch to **People × pages** on **Page access**: each member's row shows their profile and every page. The profile row shows the baseline; tick a box to open or withhold that page for that person alone.

**Check a person** shows what one member opens and which pages were opened or withheld for them alone.

## Require two-factor sign-in on a profile
Tick **Require two-factor sign-in** on the profile. Its people set up an authenticator app at their next sign-in and cannot switch it off. The profile card then shows **Two-factor required**, with how many on it have not set it up yet; the editor names them. To require it of everyone instead, use [Sign-in security](#sec-sign-in).

## Example: Summit Valley's profiles
| Profile | Opens (in menu words) | Two-factor |
|---|---|---|
| Clinician | Forms › Submissions, Runs › Analytics, Review, Dashboards (with Edit), Reports › Overview and Library, approving and signing reports | Required |
| Nurse | Forms, Runs, Review, Dashboards, Reports, Documents › Intake and Analysis › Files | |
| Researcher | Analysis: Ask your data, Analytics Studio, Data Catalog; Dashboards | |
| Viewer (default) | Runs › Analytics, Dashboards | |

The Researcher sees sensitive columns masked: see [Data policies](#sec-data-policies).

> **Note:** The profile cards and the person-by-person list name a few pages by their own names rather than the menu's: **Queue** is Runs › Latest, By date and Failed; **Run analytics** is Runs › Analytics; **Saved Analyses** is Dashboards; **Review queue** is Review › Documents; **Task inbox** is Review › Approvals, Runs and My requests; **Browse files** is Analysis › Files.

## Limits
| What | Limit |
|---|---|
| Profile name | 100 characters |
| Description | 500 characters |
| Profiles per member | 1 (plus pages opened or withheld for them alone) |
| Who may make profiles | Workspace administrators only; a delegate may move people between existing profiles if allowed |
