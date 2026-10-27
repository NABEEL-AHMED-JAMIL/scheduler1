---
id: adm-some-tabs
title: Give a person only some tabs
summary: Open or withhold a page or a tab for one person, for a number of days or until removed, with a reason kept in the change log.
section: Access
who: Workspace administrators; an access delegate for the people their delegation reaches
where: Administration › Page access (/administration/access-profiles)
related: adm-access-profiles, adm-delegates, gs-who-sees-what, sec-audit
popular: Give a person only some tabs
---
Sometimes one person needs a little more or a little less than their profile gives: a nurse covering month-end needs **Runs › Failed** for a week; a clinician should see **Review › Approvals** but not **Review › Runs**. Rather than make a new profile, open or withhold that page or tab for them alone.

![Grant pages and tabs for one person](adm-grant-tabs "Grant pages and tabs: each page Open, Some tabs or Closed for this person, with its tabs underneath")

## Open or withhold for one person
1. Open **Administration › Page access** and scroll to **Grant pages and tabs**. Make sure **A person** is chosen.
2. Pick the **Person**.
3. Under **For**, choose how long: **Until removed**, **7 days**, **30 days** or **90 days**.
4. Type a **Reason**. It is kept in the change log.
5. In the list, each page reads **Open**, **Some tabs** or **Closed** for them:
   - **Open** or **Open every tab** opens the whole page.
   - **Withhold** closes it.
   - Tick or untick a tab under a page to open or close only that tab.

Each change applies at once and is recorded under **Changes**. The person's menu follows at their next sign-in or when their session refreshes.

## How tabs combine
- A page with **no tab chosen** opens every tab.
- A tab marked **hides the tab** has no data of its own: closing it hides it from the menu, and its data is the page's. Other tabs, when closed, also have their data refused by the server.
- What you open for one person adds to their profile; what you withhold takes away from it. Their profile is not changed.

## Put someone back on their profile
On **People × pages**, reset the person's exceptions to bring them back to their profile alone. The change log records it as **Back to their profile**.

## Example
Dr. Anika Patel's Clinician profile opens Review. For one week of ward cover the Summit Valley admin also opens **Runs › By date** for her: **Person** Dr. Anika Patel, **For** 7 days, **Reason** "Ward 4B cover, 3–9 Nov", then ticks **Runs by date** under **Queue**. After seven days the tab closes again on its own.

> **Note:** The list names some pages by their own names: **Queue** is Runs › Latest, By date and Failed, **Task inbox** is Review › Approvals, Runs and My requests. See the note in [Page access profiles](#adm-access-profiles).
