---
id: rcp-run-and-wait
title: Run a pipeline from your own system and wait for the answer
summary: Make an API client, get a token, start the Patient lookup pipeline with a parameter and read its answer in the same call, with curl commands to copy.
section: Building blocks
who: A workspace administrator makes the API client; your system (or you, in a terminal) makes the calls
where: Administration & billing › Developers › API Clients (/developers/api-clients); Developers › Developer portal (/developers/portal)
related: dev-runs, dev-clients, trg-api, dev-portal, dev-sandbox, rcp-run-pipeline
popular: Start a run from your system and get the answer back
---
A front-desk screen, a partner portal or a script often needs a quick answer from a pipeline: is this patient in the
directory, which clinic are they with. Through the customer API your system can start a run **and wait for it** in one
call, up to 60 seconds, and read the run's result from the answer. This building block calls the **Patient lookup**
pipeline of [Call another pipeline](#rcp-run-pipeline) from a terminal with curl, the same calls your developers would
make from code.

> **Privacy:** The commands below hold no real secret. Your client's secret is shown once when you make the client:
> keep it in your system's secret store or an environment variable, never in a script, a ticket or a screenshot.

## What you'll build

An API client **Front desk lookup** with three scopes, and three calls: a token, the pipeline's id, and a run that waits
for its answer.

![Run and wait in the Developer portal](rcp-x-run-and-wait-guide "Developer portal › Guides › Run and wait: the call, what comes back in time, and the 202 when it takes longer")

## What you need first

1. The **Patient lookup** pipeline, its `mrn` parameter and its **Only when started** schedule, built as in
   [Call another pipeline](#rcp-run-pipeline). Its **Data sensitivity** is **Sensitive**.
2. A workspace administrator, to make the API client.
3. A terminal with `curl` and `jq` (on a Mac, `uuidgen` makes the idempotency keys; elsewhere use any unique text).
4. The API's address: **Administration & billing › Developers › Developer portal**, the **Base URL** card (it ends in
   `/v1`).

## Build it

### Make the API client

1. Open **Administration & billing › Developers › API Clients** and choose **New API client**.
2. **Name** `Front desk lookup`. Tick the **Scopes** `pipelines:read`, `runs:write` and `runs:read`, and no others.
3. Choose **Make client**. **API client made** shows the **Client id** and the **Client secret**: **Copy** both now; the
   secret is not shown again (see [API clients](#dev-clients)).

### Call it from a terminal

Put the address and the client's id and secret in your terminal's environment (paste your own values in place of the
dots; they stay on your computer):

```Your values, as environment variables
export API_URL="https://your-console-host/v1"   # the Base URL from the Developer portal
export CLIENT_ID="cl_..."                       # the client id
export CLIENT_SECRET="..."                      # the client secret, shown once
```

Get a token. It lasts 15 minutes; run this again when a call answers 401.

```1. Get an access token
export TOKEN=$(curl -sS --fail-with-body "$API_URL/oauth/token" \
  -d grant_type=client_credentials \
  -d client_id="$CLIENT_ID" \
  --data-urlencode client_secret="$CLIENT_SECRET" | jq -r .access_token)
```

Find the pipeline's id by its name:

```2. Find the Patient lookup pipeline
export PIPELINE_ID=$(curl -sS --fail-with-body "$API_URL/pipelines" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | select(.name == "Patient lookup") | .id')
echo "$PIPELINE_ID"
```

Start a run with the record number and wait up to 30 seconds for it:

```3. Run and wait
curl -sS --fail-with-body "$API_URL/pipelines/$PIPELINE_ID/runs?wait=30s" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"mrn": "SV-000703"}, "reference": "front-desk-0703"}'
```

## Check it worked

1. Call 2 prints a pipeline id. Empty means no pipeline is named exactly `Patient lookup`, or the client lacks
   `pipelines:read`.
2. Call 3 answers **200** within a few seconds, with the run's `status` `completed`, your `reference`
   `front-desk-0703`, and a `result`: the run's final rows, here one row with `mrn`, `name` and `clinic`.
3. Because the pipeline is marked **Sensitive**, the person's details in `result.rows` read `•••`, and `result.masked`
   names the masked columns. That is the data policy at work: the system that called sees only what the policy lets it.
4. In the console, **Run & review › Runs** lists the run of **Patient lookup**, started through the API.

What a completed answer looks like (shortened; your ids and times differ):

```The answer of a completed run (shortened)
{
  "id": "...", "status": "completed", "reference": "front-desk-0703",
  "message": "3 of 3 step(s) completed.",
  "result": {
    "step": "answer", "columns": ["mrn", "name", "clinic"], "rowCount": 1,
    "rows": [ { "mrn": "•••", "name": "•••", "clinic": "Lakeview clinic" } ],
    "truncated": false, "masked": ["mrn", "name"], "problem": null
  }
}
```

> **Note:** Not yet verified end to end against the Patient lookup pipeline: which columns are masked depends on your
> workspace's data policy. The call and its answer follow the Developer portal's **Run and wait** guide.

## Common mistakes

- **202 instead of 200.** The run took longer than `wait`. Nothing is wrong: follow it with `GET /runs/{runId}` (scope
  `runs:read`) until it settles, then read `GET /runs/{runId}/result`. A run waiting for a person's approval always
  answers 202.
- **409, run in flight.** One run of a pipeline is in flight at a time; wait for the first, or send the same
  `Idempotency-Key` again to get the first run's answer instead of starting a second.
- **422 at `parameters.mrn`.** The parameter's name is wrong, or the required value is missing. The pipeline's
  parameters are listed by `GET /pipelines/{pipelineId}`.
- **401.** The token ended after 15 minutes; get a new one. **403**: the client lacks the scope for that call.
- **The call is cut off at 504.** Keep `wait` at 60 seconds or less and your client's own timeout above it.
- **A test key (`cl_test_...`) answers 404.** Test keys work only in the sandbox workspace and its sample pipelines;
  your own pipelines need an ordinary client (see [The sandbox](#dev-sandbox)).
