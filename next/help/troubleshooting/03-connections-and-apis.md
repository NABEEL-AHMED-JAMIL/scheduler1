---
id: ts-connections
title: Connections and APIs
summary: Too many calls refused up front, a call the other system refused or answered wrongly, a blocked address, and a record the API's contract refused.
section: By message
who: Workspace administrators set up Call API steps and API collections; developers read the API's answers
where: Get data in › Connections › API collections (/connections/api-collections); Run & review › Runs › Failed (/runs/failed)
related: ts-runs, ts-documents, ts-faq
---
A pipeline that calls another system depends on that system's answers, and the API that other systems call depends on
what they send. These are the messages you see on either side, and what to do about each.

## Too many calls
**The message:** `The input has 1,000 rows; Call API makes at most 300 calls (At most calls). Put a filter, a limit or
an aggregate before it, send them in batches, or call once.`

When the step sends rows in batches: `The input has 9,000 rows: 9 calls of 1,000 rows; Call API makes at most 5 calls
(At most calls). Raise Rows per call (at most 1,000), or put a filter, a limit or an aggregate before it.`

**Why:** **At most calls** (100 unless the step says otherwise, never more than 500) protects the other system and your
bill. The step counts the calls it would make **before it sends any**, so nothing was sent and no call was billed.

**Fix:** what the message says: filter, limit or aggregate the rows before the step; set **Send** to batches and raise
**Rows per call**; send once; or raise **At most calls** if the other system allows it. Then **Retry from step N**.

![Call API refused before sending](ts-too-many-calls "The step needed 1,000 calls and allows 300: it failed before making any")

> **Note:** On the run's **Items** tab such a run lists every row as a failed item, because none was sent. Retrying them
> fails the same way until the step or its input changes.

## A call the other system refused
**The message:** `Call 5 of 30 was not ok: HTTP 503: The API answered HTTP 503. (When a call is not ok: fail; set it to
continue to branch on api_ok instead).`

The reason after "not ok:" is one of:
- `HTTP 503` or `HTTP 404: …`: the other system answered with an error status.
- `no answer`: it did not answer at all.
- `the answer's json.status is denied, not eq approved`: it answered, but the step's **Ok only when** condition did not
  hold.

**Why:** the other system refused the call, was down, or answered something the step treats as not ok. In **Runs ›
Failed** this kind of failure is grouped as **A service it called**.

**Fix:**
1. Read the run's **Log**: each call's status and the first characters of its answer, "Call 5 of 30: HTTP 503, …".
2. If the other system was down, **Retry failed items** (or **Retry from step N**) once it is back: only the calls that
   failed are sent again.
3. If some refusals are normal (a patient not found, say), set **When a call is not ok** to `continue`. Each row then
   carries `api_status`, `api_ok` and `api_error` (the prefix is the step's **Column prefix**), the run warns "3 call(s)
   were not ok; their rows carry api_error.", and a later Filter step can send those rows elsewhere.

## A blocked address
**The message:** `The API request was blocked: …` (in a collection's own test, `The call was blocked: …`).

**Why:** the console only calls addresses it is allowed to reach. A private address (a server inside your network) is
refused unless the platform's operator has listed it.

**Fix:** use the API's public address. If it must be a private one, ask your platform administrator to allow it. See
[What the console may call](#con-addresses).

## The API refused a record (422)
When your own system starts a run or sends an event through the customer API, the record is checked against the
pipeline's or the event's data contract **before** anything is stored. A record that does not meet it is answered
`422 Unprocessable Content`, and no run is made.

| What was sent | The answer's detail |
|---|---|
| A run's record | The record does not meet the pipeline's input contract. |
| An event | The event's data does not meet its contract. |
| A run with no record, for a pipeline that needs one | `record`: this pipeline's runs take a record meeting its input contract |

The answer lists each field that failed by its path, such as `record.loinc` or `data.loinc`, with the reason.

**Fix:** correct the field the answer names and send again. If the contract itself cannot be read for a moment, the
answer is 503: "The pipeline's input contract cannot be read right now. Try again in a moment."

## Learn more
- Data contracts inside a pipeline: [Documents, forms and reports](#ts-documents--a-row-that-does-not-hold-to-its-contract).
- Retrying: [When a run or a step fails](#ts-runs).
- Setting up calls: [Make an API collection](#con-api-collections), [Test a request](#con-api-test); the customer API:
  [Start a run and read it back](#dev-runs).
