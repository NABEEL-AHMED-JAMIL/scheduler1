---
id: sec-sign-in
title: Sign-in security
summary: The workspace's password rules, lockout, idle sign-out and two-factor rule, single sign-on, and the history of every sign-in.
section: Sign-in
who: Workspace administrators
where: Administration › Sign-in security (/administration/security)
related: gs-sign-in, gs-two-factor, adm-access-profiles, adm-reset-remove, sec-audit
popular: Set the workspace's sign-in rules
---
**Sign-in security** decides how people sign in to your workspace: how strong a password must be, what happens after failed attempts, when idle sessions end, whether a code from an authenticator app is needed, and whether people sign in with their company account. Below the rules, the page lists every sign-in to the workspace.

Every field left empty follows the platform's default, shown greyed in the box. Password rules apply from each person's next password change or reset; the rest from their next sign-in.

![Sign-in rules](sec-sign-in-rules "Sign-in rules: Passwords, Lockout and Sessions, with the rules in force at the top right")

## Set the workspace's sign-in rules
1. Open **Administration › Sign-in security**.
2. Under **Passwords**, set what you need:
   - **Minimum length** (8 to 128 characters);
   - **Upper-case letter**, **Lower-case letter**, **Digit**, **Symbol**: **Required** or **Not required**;
   - **Remember earlier passwords**: a new password may not be any of the last N (0 to 24; 0 is off);
   - **Maximum age**: days before a change is owed (0 is never).
3. Under **Lockout**, set **Lock after** (3 to 20 failed attempts in a row, passwords and codes alike) and **Lock for** (1 to 1,440 minutes). Administrators are told of a lock and can unlock under **Users**.
4. Under **Sessions**, set **Sign out after** (5 to 720 minutes without activity; people are warned a minute before) and **Require two-factor login**.
5. Choose **Save rules**. **Use the platform's defaults** clears your own values.

The list at the top right, **Rules in force**, says in words what applies now. Every password is also checked against commonly used passwords and the person's own sign-in name.

## The platform's defaults
Unless your workspace sets its own, these apply today:

| Rule | Default |
|---|---|
| Minimum length | 12 characters |
| Upper-case, lower-case letter and digit | Required |
| Symbol | Not required |
| Remember earlier passwords | 5 |
| Maximum age | 0 (never) |
| Lock after | 5 failed attempts |
| Lock for | 15 minutes |
| Require two-factor login | No |

## Two-factor sign-in for everyone, or for some
- **Require two-factor login: Required** makes everyone who signs in with a password set up an authenticator app at their next sign-in.
- To require it of some people only (clinicians, say), leave it off here and tick **Require two-factor sign-in** on their [access profile](#adm-access-profiles--require-two-factor-sign-in-on-a-profile).

**Administration › Users** shows who has it on (**2FA on**, **2FA off**).

## Single sign-on
With single sign-on people sign in with their company account, and their company's own two-factor sign-in applies. Both **OpenID Connect** (Microsoft Entra ID, Google Workspace, Okta) and **SAML 2.0** (ADFS, Okta, Entra ID) work.

![Single sign-on](sec-sso "Single sign-on: protocol, the provider's details, email domains and new people")

1. Under **Single sign-on**, choose **OpenID Connect** or **SAML 2.0**.
2. Type the **Name on the sign-in button** (for example "Summit Valley (Microsoft)").
3. For OpenID Connect, type the **Issuer**, the **Client (application) id** and the **Client secret**, and register the **Redirect URI** shown with your provider. For SAML, **Upload metadata** (or paste it) from your provider, check the **Identity provider entity ID**, **Single sign-on URL** and **Signing certificate**, then register our entity ID and reply address (or **Download our metadata**) with your provider.
4. Under **Email domains**, list your company's domains. Only those addresses sign in this way.
5. Under **New people**, choose **Only people already added under Users**, or **Add them at their first sign-in, as a workspace member** with **Their access profile**.
6. Choose **Save single sign-on**, then **Test the issuer** (OpenID Connect) or **Test sign-in** (SAML).
7. Tick **On: people can sign in this way** and save again.

The section's **How to connect …** notes walk through Entra ID, Google, Okta and ADFS. **This workspace's sign-in link** is the address to give people; on the sign-in page they can also use **Sign in with your company**. The client secret is stored encrypted and never shown again.

## Sign-in history
Every sign-in to the workspace, successful or not: **When**, **Person**, **Outcome**, **Method**, **Reason**, **Address** and **Device**. Search by name or address, filter by outcome and method, and choose **Export CSV**. Each person sees their own on **My security**.

![Sign-in history](sec-history "Sign-in history, with its filters and Export CSV")

## Limits
| Setting | Range |
|---|---|
| Minimum length | 8–128 characters |
| Remember earlier passwords | 0–24 |
| Maximum age | 0–3,650 days |
| Lock after | 3–20 attempts |
| Lock for | 1–1,440 minutes |
| Sign out after | 5–720 minutes |
| SAML signing certificates | up to three, during a rollover |

## Example
Summit Valley keeps the platform's password rules and lockout, signs people out after 30 minutes idle, and requires two-factor sign-in on its Clinician profile rather than for everyone. Single sign-on is not set up yet.
