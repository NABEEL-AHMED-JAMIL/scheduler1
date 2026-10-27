---
id: adm-reset-remove
title: Reset a password or remove someone's access
summary: Reset a password, unlock an account, reset two-factor sign-in, sign someone out, deactivate or delete an account.
section: People
who: Workspace administrators
where: Administration › Users (/administration/users)
related: adm-people, gs-sign-in, gs-two-factor, sec-sign-in
popular: Reset someone's password
---
When someone forgets their password, loses their phone or leaves, an administrator puts it right from **Administration › Users**: from the person's row menu (the three dots) or from their own page.

![A person's Sign-in security](adm-user-security "Sign-in security on a person's page: two-factor, last sign-in, password and lock, with Reset password and Reset two-factor login")

## Reset someone's password
1. Open **Administration › Users** and, in the person's row menu, choose **Reset password**.
2. Type a **New password** that meets the workspace's rules (the rules tick as you type).
3. Choose **Reset password**.
4. The notice at the top right offers **Copy password** for two minutes. Pass the password to the person by a channel you trust.

They sign in with it and are asked to choose their own straight away. The password is stored hashed and nobody can read it back.

## Unlock an account
After too many failed sign-ins in a row an account is locked for a while, and administrators are told. The person's row shows **Locked**. Choose **Unlock** in the row menu to let them try again now.

## Reset two-factor sign-in
For someone who lost their phone and their recovery codes:
1. Make sure it is really them asking.
2. In their row menu choose **Reset two-factor login**, then confirm.

Their authenticator app and recovery codes stop working and they are signed out everywhere. If two-factor sign-in is required of them, they set it up again at their next sign-in.

## Sign someone out
On the person's page, **Sessions open now** lists where they are signed in; **Sign out everywhere** ends them all.

## Remove someone's access
Choose between two:

| | Deactivate | Delete |
|---|---|---|
| What it does | Signs them out everywhere and stops them signing in | Removes the account for good: they can never sign in again |
| Their work, schedules and history | Kept | What they made and the account's history stay; their profile picture and their page exceptions go |
| Can it be undone? | Yes: **Activate** | No |

1. In the person's row menu choose **Deactivate** (or, on their page under **Danger zone**, **Deactivate**).
2. Confirm. The row now reads **Inactive**.

To delete, choose **Delete** in the row menu (or **Delete user** under **Danger zone**) and confirm.

> **Warning:** Deactivate first when you are not sure. A deactivated account can be switched back on; a deleted one cannot.

> **Note:** You cannot deactivate or delete your own account.

![The Danger zone](adm-user-danger "Danger zone: deactivate or delete the account")

## Example
Kevin Lee in finance leaves Summit Valley at the end of the month. The admin deactivates his account on his last day, so his expense claims and their history stay; his manager Claire Martin's approvals are unaffected.
