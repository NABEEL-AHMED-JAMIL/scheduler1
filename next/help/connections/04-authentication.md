---
id: con-api-auth
title: How an API signs in
summary: None, bearer token, basic, API key or OAuth2 client credentials, set once on the collection and kept as secrets.
section: API collections
who: Workspace administrators
where: Connections › API collections (/connections/api-collections)
related: con-api-collections, con-api-test, con-api-import
---
Most APIs want to know who is calling. In an API collection the sign-in is set once, as the collection's **Default
auth**, and each API either takes it (**From the collection**) or names its own scheme. The secret parts are never
typed into the scheme itself: they are `{{variables}}` whose values live in an environment, marked **Secret**.

## The schemes
| Scheme | What it sends | Its settings |
|---|---|---|
| **None** | No credentials | — |
| **Bearer token** | `Authorization: Bearer …` | **Token**, a secret such as `{{token}}` |
| **Basic** | A user name and password | **Username** and **Password** (a secret) |
| **API key** | A key in a header or a query parameter | **Header or parameter name** (such as `X-Api-Key`), **Value** (a secret) and **Sent in** (`header` or the query) |
| **OAuth2 client credentials** | A token it first fetches from your identity provider | **Token URL**, **Client id**, **Client secret** (a secret), and **Scope** and **Audience** when the provider wants them |

With OAuth2 client credentials the console asks the **Token URL** for a token with the client id and secret, then sends
that token with each call. You never paste a token that expires.

## Set the collection's default auth
1. Open the collection and choose **Edit details** (or set it while making a **New collection**).
2. Under **Default auth**, pick the **Scheme**.
3. Fill in its settings. Every secret field takes a variable, such as `{{clientSecret}}`.
4. Choose **Save changes**.
5. In each environment the collection uses, add the variables the scheme names, and tick **Secret** on the secret ones.
   See [Make an API collection](#con-api-collections--add-an-environment-and-its-variables).

![Default auth set to OAuth2 client credentials](con-api-auth "Edit collection: the default auth's scheme, with the client secret as a variable")

## Give one API its own scheme
1. Open the API and choose the **Auth** tab.
2. Pick a scheme in **Authentication**. **From the collection** is the usual choice; another scheme still reads its
   settings from the collection's details.
3. The tab shows what the API will sign in with and, per setting, whether its secret is **••• configured**, **not set**
   or **not in this environment**.

The collection's list shows each API's scheme in the **Auth** column, for example **None (from the collection)**.

> **Privacy:** Secret values are sealed as they arrive and never come back to the browser, not even to an
> administrator. A test's answer comes back masked. To change a secret, replace it; you cannot read it.

> **Tip:** Keep one environment per place you call (a sandbox and production), each with its own secrets, and make the
> sandbox the **Default** while you build.

## Example
Summit Valley's **Summit Valley platform API** collection signs in with **OAuth2 client credentials**: the **Token URL**
is `{{apiBase}}/v1/oauth/token` and the client id and secret are `{{clientId}}` and `{{clientSecret}}`, kept as
secrets in its environment. Its one API posts an event that starts the patient's journey. The public health APIs need
no sign-in, so that collection's default auth is **None**.
