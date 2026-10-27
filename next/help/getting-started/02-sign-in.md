---
id: gs-sign-in
title: Sign in
summary: Your address and password, the one-time password of a new account, single sign-on, and what to do when you cannot get in.
section: Start here
who: Everyone with an account in a workspace
where: Sign in (/login); Account › Your profile (/profile)
related: gs-two-factor, gs-profile, adm-reset-remove, sec-sign-in
popular: Sign in for the first time
aliases: start
---
You sign in with the email address your administrator added you with and a password. Your workspace may also let you sign in with your company account (single sign-on), and may ask for a code from an authenticator app after the password.

![The sign-in page](gs-sign-in "Sign in: username and password, or Sign in with your company")

## Sign in for the first time
When an administrator adds you, the console emails you a **one-time password**, unless the administrator set a password and passed it to you themselves.

1. Open the console's address and choose **Sign in**.
2. Type your email address under **Username** and the one-time password under **Password**, then choose **Sign in**.
3. If your workspace requires two-factor sign-in, set it up now: see [Two-factor sign-in](#gs-two-factor--set-it-up-at-sign-in).
4. The console opens **Your profile** with the note **Choose your own password.** Type the one-time password under **Current password** and your own under **New password**. The rules under the box tick as you meet them.
5. Choose **Change password**. The emailed password stops working at once.

Until you choose your own password, every page you open brings you back to **Your profile**.

> **Tip:** Choose **Password rules** under the new password to see every rule your workspace sets, such as the minimum length and whether a symbol is needed.

## Sign in with your company
If your workspace uses single sign-on, either:
- open the sign-in link your administrator gave you and choose **Continue with** and your company's name, or
- choose **Sign in with your company**, type your **Work email** and choose **Continue**.

You then sign in at your company's own sign-in page, with your company's own two-factor sign-in. Only addresses in the email domains your administrator listed can sign in this way.

## When you cannot sign in
| What you see | What to do |
|---|---|
| Your password was not accepted | Check the address and the password. After several failed attempts in a row the account is locked for a while: wait, or ask an administrator to unlock it. |
| **Forgot your password?** | Ask your workspace administrator to reset it. You choose your own at your next sign-in. |
| **Your password has expired.** | Your workspace asks for a new password after a number of days. Choose a new one on **Your profile** to carry on. |
| **You were signed out because the console was not used for a while.** | Your workspace signs out idle sessions. You are warned a minute before. Sign in again. |
| **Your password was changed. Please sign in with the new password.** | The password changed in another session. Sign in with the new one. |

> **Note:** The lockout, the idle time and the password rules are your workspace's. Administrators set them under [Sign-in security](#sec-sign-in).

## No account yet?
**Request a workspace** on the sign-in page asks the platform's team for a new workspace for your organisation. If your organisation already has one, ask its administrator to add you instead.

## Example
Dr. Minh Nguyen, a physician at Summit Valley, receives his one-time password by email. He signs in, sets up his authenticator app because the Clinician profile requires it, saves his recovery codes, and chooses his own password on **Your profile**. From then on he signs in with his password and a code.
