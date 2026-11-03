---
id: pl-build-json
title: Shape rows into JSON with a Build JSON step
summary: Turn flat rows into the exact JSON another API or a client app expects -- nested objects, lists grouped from many rows, fixed values and renamed keys -- and send it with Call API.
section: Build and try
who: Anyone who builds pipelines
where: Build › Pipelines › a pipeline › Steps (/pipelines/list)
related: pl-route, pl-builder, step-check, dev-runs
---
A pipeline's rows are flat: one value per column. Many APIs and apps want something else, such as one object per patient
with a list of findings inside. A **Build JSON** step makes that shape for you. You list the keys the JSON should have,
and say where each value comes from.

For example, from one row per finding it can make one document per patient:

```json
{ "patient": { "id": "P-101", "name": "…" },
  "findings": [ { "code": "L89.1", "text": "Stage 1 pressure injury" }, { "code": "E11.9", "text": "Type 2 diabetes" } ],
  "source": "etl-console" }
```

![The Build JSON step's panel: the keys of the shape on the left, and the live preview showing the first document made from the sample rows](pl-build-json "Build JSON: the shape, and the documents it makes from the sample rows")

## Build the shape

1. On the pipeline's **Steps** tab, add **Build JSON** from **Add step**.
2. Under **Shape**, add one key per value. A dot in a key nests an object: `patient.id` and `patient.name` make
   `"patient": { "id": …, "name": … }`.
3. For each key, choose where its value comes from:
   - **Column**: a column's value.
   - **Fixed value**: the same value in every document, such as `etl-console`. Type `true`, `false`, `null` or a plain
     number to write it as one.
   - **Formula**: a formula on the row, written as in a **Compute** step, such as `concat(first_name, ' ', last_name)`.
   - **List of a column**: a list of one column's values over the document's rows, such as every diagnosis code.
   - **List of objects**: a list with one object per row. Add the keys **each item** has, such as `code` and `text`.
4. Choose a **Type** when the value must be one: **Text**, **Number**, **True / false** or **Date (ISO)**, which writes
   dates as `2026-11-02`. **As it is** keeps numbers as numbers and empty values as `null`. A column that holds JSON
   text (an AI step's list) becomes the list or object it holds.
5. Tick **Leave out repeats** on a list to keep each value once.

You already have an example of the JSON you need, such as from the API's documentation? Choose **Start from an
example** and paste it. Each value becomes a key: a column of the same name when the rows have one, else the example's
value as a fixed value. Then check each key.

## One document per row, per group, or for the run

Under **Make**:

- **row**: one document per row.
- **group**: one document per group of rows. Choose the **Group by** columns, such as `patient_id`. The group's keys
  come from its first row, and its lists from all its rows.
- **all**: one document for the whole run, with lists over every row.

## Where the documents go

Under **Write it**:

- **column** (the default): each document goes in a column, `json` unless you name another. The row keeps its other
  columns (with **group**, the **Group by** columns). This is what a **Call API** step sends.
- **rows**: the document's own top-level keys become the columns. Use this when the run's result itself should have
  the shape, for your API or a webhook.
- **file**: a **JSON** file (one document, or a list of them) or **JSON Lines** file (one document per line) kept with
  the run. The rows also go on as with **column**.

## See it as you build

The **Preview** under the settings runs the step on the sample rows as you edit, and shows the first documents. Open
**Sample rows** to change the rows for the preview only. The preview also says when a key had no value, or a value was
not of its type. A person's details, such as names and patient IDs, are masked in the preview.

## Send it with Call API

In the **Call API** step after it, set **Send a JSON column as the body** to the column (`json`). Each call then sends
that row's document as it is. Write the saved request's body as `{{body}}`: the step fills it by itself, with no
variable to add. With **Send** set to `batch`, `{{body}}` and `{{rows_json}}` are a list of documents.

The run's result, the customer API and webhooks also give the documents as JSON objects, not as text.

## Things to know

| What | How it works |
| --- | --- |
| Keys | Up to 200; a list of objects up to 100 keys each; a key up to 8 parts joined by dots |
| An empty value | `null`, or left out with **Leave out empty keys**. The run's log says which keys were empty, and in how many documents |
| A value not of its type | Left empty (`null`), and the log says how many |
| Largest document | 1,024 KB unless you say, up to 8 MB. A bigger one fails the step and says which document |
| Group by | Up to 10 columns |
| Personal data | Masked in previews and downloads for anyone without **See personal data**, inside the document too |
