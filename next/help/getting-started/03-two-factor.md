---
id: gs-two-factor
title: Two-factor sign-in
summary: Set up an authenticator app, keep your recovery codes, and what to do when you lose your phone.
section: Your account
who: Everyone who signs in with a password; your workspace may require it
where: Account › My security (/account/security)
related: gs-sign-in, sec-sign-in, adm-reset-remove, adm-access-profiles
popular: Turn on two-factor sign-in
---
Two-factor sign-in (the screens call it **Two-factor login**) asks for a 6-digit code from an app on your phone after your password. A stolen password alone is then not enough to get into your account.

Your workspace may require it of everyone, or only of the people on certain access profiles (clinicians, say). Where it is required you set it up at your next sign-in and cannot turn it off.

![Two-factor login on My security](gs-two-factor "My security › Two-factor login: on since, recovery codes left, New recovery codes")

## Turn on two-factor sign-in
1. Open your avatar at the top right and choose **My security**.
2. Under **Two-factor login**, choose **Set up two-factor login**.
3. Open an authenticator app on your phone (Microsoft Authenticator, Google Authenticator, 1Password, Authy or another).
4. Scan the QR code with the app, or type the **Key** shown beside it.
5. Type the 6-digit code the app shows under **Code from the app** and choose **Turn on**.
6. Save your recovery codes: choose **Copy** or **Download**. They are shown only once.

**Two-factor login** now shows **On**, the date it was turned on and how many recovery codes are left.

## Set it up at sign-in
When your workspace requires it and you have not set it up, the sign-in page shows **Set up two-factor login** after your password. Follow the same steps, then choose **I've saved them — continue** once your recovery codes are safe.

## Sign in with a code
1. Sign in with your address and password.
2. On **Two-factor login**, type the code your app shows and choose **Sign in**.

## Recovery codes
You get 10 recovery codes. Each signs you in once when your phone is not at hand: on the code step choose **Use a recovery code instead**.

- **Recovery codes left** shows how many you have; it turns amber below 3.
- To get a new set, choose **New recovery codes**, type your password and choose **Make new codes**. The old ones stop working.

## When you lose your phone
- If you still have a recovery code, sign in with it and make new recovery codes. To move to a new phone, turn two-factor off and set it up again; where it is required, ask your administrator to reset it instead.
- If you have neither, ask your workspace administrator to **Reset two-factor login** for you. Your old app and codes stop working and you are signed out everywhere; if your workspace requires two-factor sign-in, you set it up again at your next sign-in.

> **Warning:** An administrator should reset two-factor sign-in only when they are sure it is really you asking, for example by calling you on a number they already have.

## Turn it off
Choose **Turn off**, type your password and a code from the app (or a recovery code), then **Turn off two-factor login**. **Turn off** is not offered while your workspace or your access profile requires it.

## Limits
| What | Limit |
|---|---|
| Code from the app | 6 digits |
| Recovery codes | 10, each works once |
| Who may reset it for you | A workspace administrator |
