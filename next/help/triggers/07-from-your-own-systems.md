---
id: trg-api
title: Start a pipeline from your own systems (the API)
summary: Your portal or system starts a run with a record, files and parameters, then reads its status, steps and result.
section: Start on arrival
who: A workspace administrator makes the API client; the client needs the runs:write scope to start runs
where: Administration & billing › Developers › API Clients (/developers/api-clients); Developers › Developer portal (/developers/portal)
related: trg-events, trg-run-now, trg-backfills, pl-placeholders, dev-overview
---
The platform's API lets your own systems do what **Run now** does, without a person: a partner portal starts a run for
each lab record it receives, a hospital system starts a run when a patient is discharged. The console stays your
administrators' tool; the API is how your systems reach the platform.

## Before you start

1. A workspace administrator makes an **API client** for the system on **Administration & billing › Developers › API
   Clients**, with only the scopes it needs: `pipelines:read` to list the pipelines it may start, `runs:write` to start
   them, `runs:read` to follow them, `files:write` to upload files for them.
2. The client's secret is shown once. The system exchanges its id and secret for a token that lasts 15 minutes.

## Start a run

The system sends `POST /v1/pipelines/{pipelineId}/runs` with, as it needs:

- **record**: the data for the run, checked against the pipeline's input contract when it has one;
- **files**: the ids of files it uploaded first with `POST /v1/files`;
- **parameters**: values for the pipeline's run parameters, by name (see [run parameters](#pl-placeholders--run-parameters));
- **reference**: its own id for this work, echoed back.

It sends an `Idempotency-Key` header with each start. Sending the same key again within 24 hours returns the first run
instead of starting a second one, so a retry after a network error is safe.

```Start a run (the request line)
POST /v1/pipelines/{pipelineId}/runs
```

## Follow the run and read its result

| Request | Answers |
|---|---|
| `GET /v1/runs/{runId}` | The run's status (queued, running, completed, failed, skipped or interrupted), times (UTC) and review status |
| `GET /v1/runs/{runId}/steps` | Its steps, in order |
| `GET /v1/runs/{runId}/outputs` | The files it received and made, and its review |
| `GET /v1/runs/{runId}/result` | A completed run's final rows: at most 100 rows and 16 KB, masked by the workspace's data policy |
| `GET /v1/runs/{runId}/items` | Each file, document or row it worked one by one |

The full reference, with samples and a sandbox for testing without touching real pipelines or the
bill, is in the Developer portal.

## Example

Northgate Labs' system starts **Partner starts a run through the API** with three lab records, one request each, each
with its own `Idempotency-Key`. Every run validates the record, flags abnormal values, keeps the file and makes a
report; the partner's script then reads each run's status, steps and outputs back.

## Limits

| What | Limit |
|---|---|
| A token | 15 minutes |
| Calls | The limits per client and per workspace shown on API Clients; past them the API answers 429 with a time to wait |
| A run's result through the API | 100 rows and 16 KB |
| An Idempotency-Key | Remembered 24 hours |
| Runs started this way | Billed like any run |
