---
id: qa-sign-in
title: "Test area 02: sign-in and two-factor"
summary: The first sign-in, wrong passwords and lockout, two-factor sign-in and recovery codes, idle sign-out and the sign-in history.
section: Set up and access
who: Testers; most checks as the administrator (A) and a member (R or F)
where: Sign in (/login); Account › My security (/account/security); Administration › Sign-in security (/administration/security); Administration › Users (/administration/users)
related: gs-sign-in, gs-two-factor, sec-sign-in, adm-reset-remove, qa-guide
---
These checks cover how people get in: a new account's first sign-in, what happens after wrong passwords, two-factor
sign-in with an authenticator app, recovery codes, idle sign-out, and the records the console keeps of every sign-in.

**Before you start:** an authenticator app on a phone (any of them), the accounts of [How to use this guide](#qa-guide),
and the workspace on the platform's default sign-in rules (**Administration › Sign-in security** shows **Use the
platform's defaults** with nothing of your own). Some checks lock or reset a test account: use F or a spare test account,
never A.

Tested by ______ on ______

![The sign-in page](qa-sign-in "Sign in: Username and Password, Sign in with your company, Request a workspace")

## The first sign-in
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-02.01 | The sign-in page | Open the console's address while signed out | The page shows **Username**, **Password** and **Sign in**, and **Request a workspace** | ☐ Pass ☐ Fail |
| QA-02.02 | A new account gets a one-time password | As A, **Administration › Users** › **New user**: a new test person, **Password** left empty, **Role** Workspace member; **Create** | The person is listed as **Invited**; a one-time password is emailed to the address given | ☐ Pass ☐ Fail |
| QA-02.03 | The first sign-in asks for your own password | Sign in as the new person with the one-time password | **Your profile** opens with **Choose your own password.**; opening any other page brings you back to **Your profile** | ☐ Pass ☐ Fail |
| QA-02.04 | The password rules are shown and enforced | On **Your profile**, type a short new password, then one that meets the rules; choose **Password rules** | The rules under **New password** tick as each is met; **Change password** works only when all are met; **Password rules** lists the minimum length (12 by default) | ☐ Pass ☐ Fail |
| QA-02.05 | The one-time password stops working | Choose **Change password**, sign out, sign in with the emailed password | The emailed password is refused; the new one signs in | ☐ Pass ☐ Fail |
| QA-02.06 | A member cannot open sign-in security | As R, go to `/administration/security` | **This page isn't available to you**: the page is for administrators | ☐ Pass ☐ Fail |

## Wrong passwords and lockout
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-02.07 | A wrong password is refused | Sign in as F with a wrong password | The sign-in is refused and F stays on the sign-in page | ☐ Pass ☐ Fail |
| QA-02.08 | Lockout after repeated failures | Try a wrong password for F five times in a row (the default **Lock after**) | The account is locked; a right password is refused until the lock ends (15 minutes by default); A is told of the lock | ☐ Pass ☐ Fail |
| QA-02.09 | The administrator unlocks it | As A, **Administration › Users**: find F (its row shows **Locked**), row menu › **Unlock** | F can sign in at once with the right password | ☐ Pass ☐ Fail |
| QA-02.10 | The administrator resets a password | As A, F's row menu › **Reset password**, type one that meets the rules, **Reset password** | A notice offers **Copy password** for two minutes; F signs in with it and is asked to choose their own straight away | ☐ Pass ☐ Fail |

## Two-factor sign-in
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-02.11 | Turn on two-factor sign-in | As R, avatar › **My security** › **Set up two-factor login**; scan the QR code; type the code under **Code from the app**; **Turn on** | 10 recovery codes appear with **Copy** and **Download**; **Two-factor login** then reads **On**, with the date | ☐ Pass ☐ Fail |
| QA-02.12 | Sign in with a code | Sign out; sign in as R | After the password, **Two-factor login** asks for the code; the app's current code signs in | ☐ Pass ☐ Fail |
| QA-02.13 | A wrong code is refused | Sign in as R and type a wrong 6-digit code | The code is refused; a wrong code counts toward the lockout like a wrong password | ☐ Pass ☐ Fail |
| QA-02.14 | A recovery code works once | Sign in as R, choose **Use a recovery code instead**, use one code; then try the same code again | The first try signs in and **Recovery codes left** drops by one; the second try is refused | ☐ Pass ☐ Fail |
| QA-02.15 | New recovery codes replace the old | **My security** › **New recovery codes**, type the password, **Make new codes**; try an old code | A new set of 10 appears; an old code no longer signs in | ☐ Pass ☐ Fail |
| QA-02.16 | A profile can require it | As A, **Administration › Page access**: on F's profile tick **Require two-factor sign-in** and save; sign in as F | F's sign-in shows **Set up two-factor login** after the password; once set up, **Turn off** is not offered on F's **My security**. Untick the profile's box afterwards | ☐ Pass ☐ Fail |
| QA-02.17 | The administrator resets two-factor | As A, R's row menu › **Reset two-factor login**, confirm | R is signed out everywhere; R's old app codes and recovery codes stop working | ☐ Pass ☐ Fail |
| QA-02.18 | The users list shows who has it | As A, **Administration › Users**, the tiles **2FA on** and **2FA off** | Choosing a tile filters the list; R and F are under the right one | ☐ Pass ☐ Fail |

## Sessions and records
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-02.19 | Idle sign-out | As A, set **Sign out after** to 5 minutes and **Save rules**; sign in as F and leave the console alone | A warning comes a minute before; then F is signed out with **You were signed out because the console was not used for a while.** | ☐ Pass ☐ Fail |
| QA-02.20 | A password change ends other sessions | Sign in as F in two browsers; change the password in one; use the other | The other session is signed out with **Your password was changed. Please sign in with the new password.** | ☐ Pass ☐ Fail |
| QA-02.21 | Where you're signed in | As F, **My security** › **Where you're signed in**: **End session** on another session | That session is signed out at once; the list no longer shows it | ☐ Pass ☐ Fail |
| QA-02.22 | Sign-in history | As A, **Administration › Sign-in security** › **Sign-in history**; filter by outcome; **Export CSV** | The successful and failed sign-ins of QA-02.07 to 02.14 are listed with **When**, **Person**, **Outcome**, **Method** and **Reason**; the CSV holds the same rows | ☐ Pass ☐ Fail |
| QA-02.23 | Each person sees their own sign-ins | As R, **My security** › **Sign-in history** | Only R's own sign-ins are listed | ☐ Pass ☐ Fail |
| QA-02.24 | Back to the defaults | As A, **Use the platform's defaults** on **Sign-in security** | **Rules in force** reads the platform's defaults again (12 characters, lock after 5 for 15 minutes) | ☐ Pass ☐ Fail |
| QA-02.25 | Another workspace's sign-ins are not shown | As X, open X's own **Sign-in security** › **Sign-in history**; search for R's address | None of A's workspace's sign-ins is listed | ☐ Pass ☐ Fail |

> **Note:** Single sign-on needs your company's identity provider and is not tested here. When your workspace uses it,
> add the checks for **Sign in with your company** at the end of this area, as described in
> [Single sign-on](#sec-sign-in--single-sign-on).

## Example
At Summit Valley the tester locks the front-desk test account on purpose (QA-02.08), sees the Summit Valley admin told of
it, and unlocks it from **Users** (QA-02.09). Dr. Anika Patel's test account turns on two-factor sign-in, uses one
recovery code, and makes a new set.
