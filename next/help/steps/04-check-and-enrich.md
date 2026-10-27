---
id: step-check
title: "Check and enrich: Validate, Enrich and Call API"
summary: Hold rows to a data contract, add fields from an API per row, and send rows to another system once, per row, in batches or with a file.
section: Combine and check
who: A workspace administrator adds steps; Call API is an administrator's step
where: Build › Pipelines › a pipeline › Steps › Add step (/pipelines/list)
related: step-combine, step-outputs, pl-try, pl-placeholders, step-glance, con-contracts, con-api-collections
popular: Call an API for each row
---
These steps talk to the workspace's data contracts and saved API requests. **Validate** checks rows; **Enrich** adds to
them from an API; **Call API** sends them somewhere and keeps each answer so later steps can branch on it. The
requests themselves (address, method, authentication, paging) are saved in the workspace's API collections.

![The Call API step's settings](step-check "Call API: one call per appointment to the payer's eligibility request")

## Validate

**What it does.** Checks each row against a data contract and fails, drops or flags the rows that do not hold.

**Settings.**

- **Contract**: one of the workspace's data contracts; or **Contract name**: a contract by name (the workspace's, else a
  system contract).
- **Contract version**: a version to hold to; empty for the contract's active version.
- **Rows that do not hold**: `fail` the step, `drop` the rows, or `flag` them: every row goes on with `_valid` (true or
  false) and `_errors`.

**Example.** **ADT feed** drops invalid events; **Claims file validation** flags the claim lines, then one branch keeps
the rejects (a **Filter** on `_valid` is false) and another the clean rows.

**Limits.** Time limit 300 seconds; tried twice on a passing error.

## Enrich

**What it does.** Calls a saved API request once per row and adds fields of its answer as columns.

**Settings.**

- **API request** (required), **Environment**, **Collection version**.
- **Variables**: the request's variables by name, filled from the row: `{{customer_id}}`.
- **Fields** (required): each **From the answer at** a dot path (`data.score`) **As column**. A path over a list
  (`results[].term`) makes one row per item.
- **When a call fails**: `fail` the step, `skip` the row, or `null` (keep it with the fields empty).
- **At most calls**: 100 unless you say.

**Example.** **Adverse event signals** asks a public drug-safety API for each of 20 drugs' most reported reactions, one
row per reaction.

**Limits.** At most 500 calls a step. Time limit 1,800 seconds.

## Call API

**What it does.** Sends to a saved request (POST, PUT) once, per row or in batches, with a file an earlier step made if
asked, and keeps the status and fields of each answer.

**Settings.**

- **API request** (required), **Environment**, **Collection version**.
- **Send**:
  - `each`: one call per row; `{{row}}` is the row as one JSON object.
  - `batch`: one call per **Rows per call** rows (50 unless you say); `{{rows_json}}` is them as one JSON array,
    `{{batch}}` of `{{batches}}`.
  - `once`: one call for the step, filled from the run and the first row.
- **Columns sent**: what `{{row}}` and `{{rows_json}}` hold: these columns, each renamed with **As** (a dot nests:
  `patient.id`). None: every column.
- **Variables**: the request's variables, filled from the row and the run (`{{patient_id}}`, `{{row}}`, `{{run}}`,
  `{{call_key}}`).
- **Fields**: each **From the answer at** a dot path (`id`, `result.status`, `errors[0].message`) **As column**.
- **Results at** (batch): a dot path to the answer's list of per-row results; each row's fields are read from its item,
  by position.
- **Ok only when**: conditions on the answer's body beyond a 2xx status, each **The answer at**, **Is**, **Value**.
- **When a call is not ok**: `fail` the step, or `continue` with the row's status and error for later steps to branch
  on.
- **Column prefix** (`api_`): the answer's columns are `api_status`, `api_ok` and `api_error`.
- **Calls at once** (1): `each` and `batch` calls made together, at most 8; answers keep the rows' order, and a busy
  service is backed off.
- **At most calls** (100): with `each`, an input needing more calls fails before any is made.

### Send a file an earlier step made

Under **A file from an earlier step**, name the step (**From step**: a **Save File**, **Generate report** or **Convert
file** step of this run), the **File name** when it made several, and where to **Put in** a file kept with the run (a
storage connection; empty for the workspace's file drop). The request's file or multipart body then gets
`{{file_bucket}}`, `{{file_key}}`, `{{file_name}}` and `{{file_format}}`.

**Before you run.** With sample rows first ([Test with sample](#pl-try)), the panel shows **What the first call sends**.

**Examples.** **Eligibility checks before tomorrow's visits** calls the payer once per appointment, four at a time, and
continues on a failed call so a **Filter** can list them for staff. **Appointment reminders** sends 50 rows a call to an
SMS service. **Clearinghouse submission** sends the claim file a **Save File** step made, once.

**Limits.** At most 500 calls; **Rows per call** up to 1,000. Time limit 1,800 seconds; one try unless the panel says
otherwise. An administrator's step.

> **Warning:** Call API reaches outside the platform. Send only the columns the other system needs (**Columns sent**),
> especially for sensitive data.
