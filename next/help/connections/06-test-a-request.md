---
id: con-api-test
title: Test a request
summary: Make one real call with an environment's values, and read the answer, its headers, what was extracted and the checks.
section: API collections
who: Workspace administrators (a test calls the API with the workspace's secrets)
where: Connections › API collections (/connections/api-collections)
related: con-api-collections, con-api-paging, con-api-auth, con-addresses
---
Before a pipeline depends on an API, try it. **Test**, at the foot of an API's panel, makes one real call through the
same runner a pipeline uses, with the environment's values and secrets, and shows what came back. Nothing is saved
except the API itself.

## Try a request
1. Open the API collection and choose the API's name. Its panel opens on the right.
2. Under **Test**, pick the **Environment**. The default one is chosen for you; **No environment** sends the request
   with no variables filled in.
3. To try other values once, open **Values for this test only** and add them: `fhir_id` = `example`. They are used for
   this call and not kept.
4. Choose **Test**. If you changed the API, the button says **Save & test** and saves it first.

![An API's panel with the Test section](con-api-request "Test: the environment, values for this test only, and the call's answer below")

## Read the answer
The first line sums the call up:

- **OK**, **Failed** or **Blocked**, then the HTTP status (`HTTP 200`), how long it took and the answer's size.
- How many attempts it took, when retries were needed.
- How many assertions passed, when the API has **Assert rules**.
- For a paged API, "N items over P pages", and whether it stopped at the page cap with more to fetch.

Below it, four tabs:

| Tab | Shows |
|---|---|
| **Body** | The first page's answer, formatted when it is JSON |
| **Headers** | The answer's headers |
| **Extracted** | The values the **Extract rules** pulled out |
| **Assertions** | Each **Assert rule**, passed or not, with the value found |

**Blocked** means the call was never sent: the address it would have reached is not one the console may call. See
[What the console may call](#con-addresses).

> **Privacy:** The answer is masked before it reaches the browser: nothing in it holds a secret the call used.

> **Warning:** A test is a real call. Testing a **POST**, **PUT**, **PATCH** or **DELETE** API changes the system it
> calls, as a run would. Test those against a sandbox environment.

## When a test fails
- **401 or 403**: the sign-in is wrong or missing. Check the **Auth** tab and the environment's secrets.
- **404**: the address is wrong; check the URL and the environment's base address.
- **Failed** with no status: the host did not answer in the **Timeout**, or could not be reached.
- An assertion failed: the API answered, but not as your rules expect; read the **Assertions** tab.

The collection's **Last test** column shows the status and time of each API you tested in this browser session; the
others say **not tested**.

## Example
Before switching the "Patient 360" pipeline to a new FHIR sandbox, Summit Valley's administrator opens **FHIR:
patients**, picks the sandbox environment and chooses **Test**: **OK**, `HTTP 200`, 100 items over four pages. The
**Body** tab shows the first page's patients, so the pipeline's **Items at** path is right before anything runs.
