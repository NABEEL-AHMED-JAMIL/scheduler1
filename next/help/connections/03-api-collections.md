---
id: con-api-collections
title: Make an API collection
summary: A collection of APIs with the sign-in they share and the environments they run in; add requests, variables and secrets.
section: API collections
who: Anyone whose page access includes API collections reads them; workspace administrators make and change them
where: Connections › API collections (/connections/api-collections)
related: con-api-auth, con-api-paging, con-api-test, con-api-versions, con-api-import, con-addresses
popular: Make an API collection
---
An API collection keeps the outside APIs your workspace calls in one place: each **API** (a request: its method,
address, parameters and body), the **default auth** they sign in with, and the **environments** whose variables fill
them in. Pipelines (**Read API**, **Enrich**, **Call API**), sources and the AI Assistant refer to an API here; they
never copy its settings, so a change is made once.

![The API collections list](con-api-collections "Connections › API collections: each collection's source, sensitivity, APIs, version and state")

## Make the collection
1. Open **Get data in › Connections › API collections** and choose **New collection**.
2. Give it a **Name** and a **Description**.
3. Pick a **Sensitivity**: **Public**, **Internal**, **Confidential** or **Restricted**. The workspace's data policy for
   that level applies to what its APIs return.
4. Leave **State** at **Active**. An inactive collection's APIs are not offered to new pipeline steps.
5. Under **Default auth**, choose the **Scheme** most of its APIs use. See
   [Authentication](#con-api-auth).
6. Choose **Create**. The collection opens on its **Overview**.

## Add an environment and its variables
An environment holds the values an API's `{{variables}}` take when it runs: a base address, a page size, a client id,
and the secrets.

1. Under **Environments**, choose **New environment** and name it, for example `Production` or `Sandbox`.
2. Tick **Default** to make a test and a pipeline step use it unless they name another.
3. Add a row per variable: its name (such as `baseUrl`) and its value. Tick **Secret** for a key, a password or a token.
4. Choose **Create**.

A secret is sealed when it arrives and never shown again: the list shows it as **••• configured**. To change it, open
**Edit or replace secrets** and choose **Replace**.

![An environment's variables](con-api-environments "Environments: the default one, with a base address per API family")

## Add an API
1. Choose **Add API**. A panel opens on the right.
2. Pick the **Method** and type the **URL**, using variables: `{{baseUrl}}/v1/orders`.
3. Give it a **Name** (and a **Folder** if the collection has folders) and a short **Description**.
4. Fill in the tabs it needs:
   - **Params**: query parameters. **Headers**: request headers. Write `{{name}}` to take a value from the environment.
   - **Auth**: usually **From the collection**.
   - **Body**: **None**, **JSON**, **Text**, **XML**, **Form (URL-encoded)**, **Multipart**, **Binary** or
     **GraphQL**, with a body template. **Multipart** and **Binary** can send a file from one of the workspace's storage
     connections.
   - **Schemas**: **Params schema** (the values a caller passes in), **Extract rules** (named values to pull from the
     answer) and **Assert rules** (checks a test and a run must pass).
   - **Settings**: **Timeout (seconds)**, **Retry attempts** (tries in all, on a timeout, a 429 or a 5xx answer),
     **Backoff (ms)**, **Paging** (see [Page through results](#con-api-paging)), and whether the AI Assistant may call
     it.
5. Choose **Save & test** to save it and make one real call, or **Save**. See [Test a request](#con-api-test).

![An API open in the side panel, with its parameters and the Test section](con-api-request "An API: method and URL, the tabs, and Test with the environment it uses")

> **Warning:** A credential is always a `{{variable}}`. A header or parameter whose name says it carries one
> (Authorization, token, api-key, password and the like) is refused when it holds a plain value: put the value in an
> environment as a secret and write `{{name}}` instead.

## Look after it
- The tiles count the **APIs**, how many are **Enabled**, the **Folders**, the **Environments** (and which is the
  default) and the **Version**.
- Untick an API's **Enabled** box, or choose **Disable** in its menu, to stop it being offered without deleting it.
- **Used by** lists every pipeline, source and AI tool that uses the collection's APIs. A delete that something still
  depends on is refused, and the console lists what uses it.
- **Edit details** changes the name, sensitivity, state and default auth.

## Example
Summit Valley's **Public health APIs** collection holds 17 keyless public APIs: FHIR patients and observations,
RxNorm, openFDA, ClinicalTrials.gov, the NPI registry and CDC PLACES. Its one environment, **Summit Valley**, sets
`fhirBase`, `fdaBase`, `rxnavBase` and the rest, so a request reads `{{fhirBase}}/Patient` and a new sandbox is one
more environment, not seventeen edited requests.

![A collection's overview](con-api-collection "A collection: its APIs, each with method, endpoint, auth, timeout and state")

## Limits
| What | Limit |
|---|---|
| Timeout | 1 to 300 seconds; 30 by default |
| Retry attempts | 1 to 10 tries in all |
| Making, changing and testing | Workspace administrators |
| Where an API may point | Public addresses: see [What the console may call](#con-addresses) |
