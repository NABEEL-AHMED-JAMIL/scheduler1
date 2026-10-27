---
id: rcp-ai-prompt
title: "Classify or summarise each row with an AI prompt"
summary: A saved prompt with a JSON answer, run row by row by the AI prompt step; the answer's fields become columns you can filter, count and approve.
section: Building blocks
who: A workspace administrator writes prompts and builds pipelines
where: Build › Pipelines › Prompts (/pipelines/prompts); Build › Pipelines (/pipelines/list)
related: ai-prompts, ai-steps, step-ai, ai-data-levels, ai-costs, rcp-ocr, rcp-call-insight, rcp-journey-care-plan
popular: Classify rows with AI
---
The **AI prompt** step asks a model the same question about every row: which category is this denial, what does this
note say. With the answer set to a **JSON object**, each answer is checked against a schema and its fields become
columns, so the next steps can filter, count or route on them like any other value. This recipe builds two small
pipelines on the same pattern: one that classifies, one that summarises.

## What you'll build

- **Denials: reasons classified and routed**: claim lines from a remittance file, the denied ones classified by a model
  into a category with an `appeal_likely` flag, then counted by payer and category into a file a board can read.
- **Progress notes summarised**: eight short ward notes, each summarised as a DRAFT with its problems and plan, one JSON
  file per note.

![The classify pipeline's steps](rcp-ai-denials-steps "Denials: reasons classified and routed: read, keep the denied lines, the first 30, the model's category, counted by payer")

## What you need first

- A model connection with a text model ([Your models](#ai-models)), and a storage connection.
- [remits-2026-10.csv](/help/samples/ai-prompt-step/remits-2026-10.csv): 40 synthetic claim lines, 27 of them denied
  with a reason in words. Upload it to `remits/remits-2026-10.csv`.
- [progress-notes.csv](/help/samples/ai-prompt-step/progress-notes.csv): eight synthetic progress notes with the
  columns `file_name`, `mrn` and `text`. Upload it to `notes/progress-notes.csv`.

## Build it

### The prompts

Open **Build › Pipelines › Prompts**, choose **New prompt** for each, and fill it as below
([Write and test a prompt](#ai-prompts)). Both use **Temperature** 0.1 and **Max tokens** 350, and answer a **JSON
object**.

```System instructions (both prompts)
You write short DRAFT notes for a person at a fictional hospital group, who checks and corrects every one. Use only the facts given; write 'not recorded' for anything missing. Never diagnose or prescribe. All data is synthetic.
```

```Message template: Denial reason category
Payer {{payer}} denied a claim: {{denial_reason}}. Write category (authorization, eligibility, duplicate, coding, medical necessity or other) and appeal_likely (true or false).
```

```Output schema: Denial reason category
{ "type": "object", "properties": { "category": { "type": "string" }, "appeal_likely": { "type": "boolean" } }, "required": ["category", "appeal_likely"] }
```

```Message template: Clinical note summary (DRAFT)
Synthetic progress note ({{file_name}}): {{text}}. Write summary (2 sentences), problems (list) and plan (one sentence).
```

```Output schema: Clinical note summary (DRAFT)
{ "type": "object", "properties": { "summary": { "type": "string" }, "problems": { "type": "array", "items": { "type": "string" } }, "plan": { "type": "string" } }, "required": ["summary", "problems", "plan"] }
```

1. Add the variables each message names: `payer` and `denial_reason` for the first, `file_name` and `text` for the
   second, with a sample value each, such as `Summit Mutual` and `Prior authorization was not on file`.
2. Choose **Run** under **Try it** and read the answer, its tokens and its time.
3. Choose **Save & activate**.

### Classify: the denials pipeline

Make `Denials: reasons classified and routed` (**Data sensitivity** Internal) with these steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `remits` | **Prefix** `remits/remits-`, **Read as** csv, **Which objects** `last_run` |
| 2 | Filter | `denied` | `status` equals `denied` |
| 3 | Limit / top N | `first` | **Rows to keep** 30 |
| 4 | AI prompt | `cat` | **Prompt** Denial reason category; **Fields** `category` as `category`, `appeal_likely` as `appeal_likely`; **When a row fails** `null`; **At most rows** 30 |
| 5 | Aggregate | `by` | **Group by** `payer`, `category`; `denials` = count |
| 6 | Upload to bucket | `keep` | **Object key** `rcm/denials.csv`, **Format** csv |

Give it a schedule: **Daily** at 06:00, or **Only when started** while you try it.

### Summarise: the notes pipeline

Make `Progress notes summarised` (**Data sensitivity** Sensitive) with these steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `notes` | **File** `notes/progress-notes.csv`, **Format** csv |
| 2 | AI prompt | `summary` | **Prompt** Clinical note summary (DRAFT); **Fields** `summary`, `problems`, `plan`; **Calls at once** 2; **At most rows** 20 |
| 3 | Save File | `keep` | **File name** `summary-{{file_name}}.json`, **Format** json, **One file per row** on, **JSON columns** `problems` |

The prompt's variables `file_name` and `text` are filled from the row's columns of the same names, so the step needs no
**Variables**.

## Check it worked

1. Run the denials pipeline with **Run now**. Step 2 keeps the 27 denied lines, step 3 the first 27 (fewer than 30),
   and step 4 adds `category` and `appeal_likely` to each.
2. The run's **AI answers** tab lists one call per row, each with the prompt, its time and its tokens; an answer that
   did not fit the schema shows **Held for review** and its row's category is empty.
3. `rcm/denials.csv` has one row per payer and category, with the count. "Prior authorization was not on file"
   lands under `authorization` in most runs; the model may differ on the borderline reasons.
4. Run the notes pipeline: 8 rows in, 8 out, and 8 files `summary-note-….json`, each with a two-sentence summary, a
   list of problems and a plan, all DRAFTs.

> **Note:** Not yet verified end to end in Summit Valley: both pipelines are built there and have not run yet. The
> same step with a JSON answer runs in [Patient journey 4](#rcp-journey-care-plan), where it did.

## Common mistakes

- **Every answer is empty.** **When a row fails** `null` keeps a row whose call failed; read the **AI answers** tab
  for why: no model connection, a model that is not loaded, or an answer held for review.
- **The run takes minutes.** Each row is a model call, one at a time unless **Calls at once** says more. Filter and
  limit the rows first (steps 2 and 3), and keep the schema small: on a local model a long list of allowed values or
  tight number limits makes every answer slow.
- **A field is missing.** **From the answer at** is a dot path into the JSON answer: `category`, or `result.score` for
  a nested one. It must match the schema's key exactly.
- **A variable is empty.** A variable not named under **Variables** is filled from the row's column of the same name;
  rename the column, or map it (`denial_reason` = `{{reason_text}}`).
- **The model sees data it should not.** The workspace's data policy decides which models may see which sensitivity;
  set the pipeline's **Data sensitivity** honestly ([Which models may see which data](#ai-data-levels)).

> **Warning:** A model's category or summary is a DRAFT. Count and route on it, but put an Approval step or the
> pipeline's review before anything leaves the workspace on its word alone.
