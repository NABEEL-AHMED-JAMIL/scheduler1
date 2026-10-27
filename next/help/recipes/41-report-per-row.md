---
id: rcp-report-per-row
title: "Statements, one per guarantor: a report per row from a pipeline"
summary: Group 600 balance lines into 18 guarantors and let one pipeline run make 18 statements from a published template.
section: Building blocks
who: A workspace administrator builds the pipeline; the template needs Report templates and Publish report templates
where: Reports › Templates (/reports/templates); Build › Pipelines (/pipelines/list); Reports › Library (/reports/library)
related: rs-pipeline, step-outputs, step-combine, rcp-branded-report, run-items
popular: Make one report for each row
---
A **Generate report** step with **One report per row** makes a separate report, each its own version in the Library,
for every row that reaches it. Shape the rows first so that one row is one report: here, one row per guarantor with the
total balance and the claims on it. The same pattern makes a route sheet per nurse or a sales report per store.

## What you'll build

- A template, **Patient statement**, that reads one guarantor's row.
- A pipeline, **Patient statements, one per guarantor**, with four steps:
  **Read CSV/JSON/Parquet** → **Aggregate** → **Compute** → **Generate report** (one report per row).
- One run that turns **600** balance lines into **18** statements, *Statement · Guarantor Marsh (fictional)* and 17 more.

This is Summit Valley's *Patient statements, one per guarantor*, which runs monthly on day 2; its run is in the figures.

## What you need first

- A storage connection (see [Connect your storage](#con-storage)); its alias is what you type as **Bucket** below. The
  examples use `summit-valley-s3`; type your own.
- The brand profile from [A branded one-page report](#rcp-branded-report), published and the workspace default
  (optional: without it the statements print in the platform's look).
- The sample files:
  - [balances.csv](/help/samples/report-per-row/balances.csv): 600 open balance lines, 18 fictional guarantors
    (`guarantor_id`, `guarantor_name`, `claim_id`, `balance`, `service_date`).
  - [statement-sample.json](/help/samples/report-per-row/statement-sample.json): one guarantor's row, to design with.
- Upload `balances.csv` to the folder `payers/` of your bucket: open **See results › Analysis › Files**, choose the
  connection, make the folder with **New folder** if it is not there, open it and choose **Upload**
  (see [Files](#dash-files)).

## Build it

### The template

1. Open **Reports › Templates**, choose **New template**, **Name** `Patient statement`, **Category (optional)** `Billing`,
   and **Create the draft**.
2. Fill the canvas with test data: the test-data chip, **Paste JSON**, the whole of `statement-sample.json`, **Fill the
   canvas**. Keep it as a test sample named `One guarantor`.
3. Add a **Heading** with the **Text** `Statement · {{primary.guarantor_name}}`.
4. Add a **Row and columns** with two columns. In the first put a **Label and value**: **Label** `Balance due`,
   **Data field** `primary.balance`, **Format** `currency`, **Currency** `USD`. In the second: **Label** `Claims`,
   **Data field** `primary.claims`.
5. Add a **Text**: `Claims on this statement: {{primary.lines}}`.
6. **Validate**, then **Publish v1**.

### The pipeline

1. Open **Build › Pipelines**, choose **New pipeline**, and under **Add steps yourself** type the **Name**
   `Patient statements, one per guarantor`; choose **Create and add steps**.
2. **Add step from the Task Registry…** → **Read CSV/JSON/Parquet**. **Key** `bal`, **Name** `Balances`,
   **Bucket** your alias, **File** `payers/balances.csv`. **Apply**.
3. Add **Aggregate**. **Key** `by`, **Name** `By guarantor`. **Group by** `guarantor_id` and `guarantor_name`.
   **Aggregations**:

| Compute | Of column | As column |
|---|---|---|
| `sum` | `balance` | `balance` |
| `count` | | `claims` |
| `list` | `claim_id` | `lines` |

4. Add **Compute**. **Key** `money`, **Name** `Rounded`. One formula: **Column** `balance`, **Formula**
   `round(balance, 2)`.
5. Add **Generate report**. **Key** `report`, **Name** `Patient statement per guarantor (template)`.
   Choose **Use a saved template**, **Template** `Patient statement`, **Version** **The latest published version**,
   **Report name** `Statement · {{guarantor_name}}`, tick **One report per row**, **At most reports** `20`. Leave
   **Brand profile** empty for the workspace default. **Apply**.
6. Choose **Save**. Then **Run now** at the top of the pipeline's page. With no schedule yet, it gives the pipeline one
   that runs only when started, and runs it.

![The Generate report step, one report per row](rcp-b-statement-step "Summit Valley's pipeline: Use a saved template, Patient statement, the latest published version, and the report name from each row")

> **Tip:** Before **Run now**, **Test with sample** on the **Steps** tab shows each step's rows: the Aggregate step should
> hold 18 rows. See [Try a pipeline before you rely on it](#pl-try).

To make it monthly, give it a schedule: **On a timetable**, **Monthly**, every 1 month on day `2` at `05:00` (see
[Run a pipeline on a timetable](#trg-schedules)).

## Check it worked

1. The run ends **Completed**, 4 of 4 steps, **Rows in → out** `600 → 18`.
2. Its **Steps** read: *Balances* `0 → 600`, *By guarantor* `600 → 18`, *Rounded* `18 → 18`, *Patient statement per
   guarantor (template)* `18 → 18` with 18 PDFs, one per guarantor, each 1 page.
3. **Items (18)** and **Outputs (18)**: one item and one file per statement.
4. **Reports › Library**, searched for `Statement`: 18 reports from **Patient statement · v1**, each **v1**, **Ready**.
5. *Statement · Guarantor Marsh (fictional)* shows **Balance due** `$6,831.23` and **Claims** `34`; *Guarantor Holloway*
   `$7,106.72`. (Six guarantors have 34 claims, twelve have 33.)

![Summit Valley's run: 600 rows in, 18 statements out](rcp-b-statement-run "Run #1927: four steps completed, 600 → 18, one PDF per guarantor")

![The statements in the Library](rcp-b-statements "Reports › Library searched for Statement: one report per guarantor, each v1 and ready")

> **Note:** At Summit Valley the statements show **Signed** because Report Studio there asks for approval of every new
> version and a physician approved them. Your statements are **Ready** until someone approves them
> ([Approve, sign and verify](#rs-approve)).

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| One report holding everything | **One report per row** is off, or the Aggregate step is missing, so all 600 rows go to one report. |
| `Statement · {{guarantor_name}}` printed literally | The column is named differently in your rows; the placeholder must match a column of the row exactly. |
| Only 20 statements of more | **At most reports** stops there (20 by default, 200 at most). Raise it, or split the run. |
| The step fails with *is not in this data* | The template reads a field the rows do not have (for example `primary.balance` when the column is `total`). Rename the column with **Compute**, or change the template's binding. |
| **Template** offers nothing | The template has no published version yet. Publish it first. |
| `balance` shows many decimals | The **Compute** step was skipped; sums of money keep the float digits until rounded. |
