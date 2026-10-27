---
id: rcp-api-chain
title: Chain APIs across two collections
summary: Look each medicine up in one public API, look its answer up in a second call, then page through another collection's recall list and join the two.
section: Building blocks
who: A workspace administrator makes the collections and the pipeline
where: Connections › API collections (/connections/api-collections); Build › Pipelines (/pipelines/list)
related: con-api-collections, con-api-paging, con-api-test, step-check, step-read, step-combine, con-addresses
popular: Use one API's answer in the next call
---
Often one API's answer is the question for the next: a free-text medicine name gives a drug code, the code gives its
ingredient, and the ingredient is what a recall list names. This building block shows the three moves that make such a
chain, with keyless public APIs and a synthetic medication list:

1. **Enrich** a row from one API, keeping a field of its answer as a new column.
2. **Enrich** again, with that new column as the next call's variable.
3. **Read API** a list from a second collection, page by page, and **Join** it to the rows.

> **Note:** Not yet verified end to end as one pipeline. Summit Valley ran its two halves as separate pipelines: **RxNorm
> ingredient normalisation** (the two calls) and **Drug recalls (openFDA enforcement, offset paging)** (the paged list
> and the join). The answers come live from the two public services, so the recall counts change.

## What you'll build

- Two API collections: **Drug terms (RxNorm)** and **Drug safety (openFDA)**, each with its own environment.
- A pipeline **Recalls touching our medication list** of ten steps.

![The two calls in a run](rcp-x-chain-run "Summit Valley's RxNorm run: 40 lines, two calls a line, 7 ingredients")

## What you need first

1. Page access to **API collections** and **Pipelines**, as a workspace administrator. The platform must be allowed to
   call `rxnav.nlm.nih.gov` and `api.fda.gov` (see [What the console may call](#con-addresses)).
2. **A storage connection**, *your bucket*, and the sample
   [med-list.csv](/help/samples/api-chain/med-list.csv) in a folder `reference/` of it: 40 lines as a ward might write
   them (`Warfarin 5 mg tab`, `lisinopril 10 MG`), with `line_id`, `medication_text`, `qty`.

## Build it

### Collection 1: drug terms

1. **Get data in › Connections › API collections**, **New collection**: **Name** `Drug terms (RxNorm)`, **Sensitivity**
   **Public**, **Default auth** **Scheme** **None**. **Create**.
2. **New environment** `Public`, **Default** ticked, variable `rxnavBase` = `https://rxnav.nlm.nih.gov/REST`.
3. **Add API** `RxNorm: approximate term`: **GET** `{{rxnavBase}}/approximateTerm.json`, **Params** `term` =
   `{{term}}` and `maxEntries` = `1`. **Save & test** with a term such as `metformin 500 mg`.
4. **Add API** `RxNorm: ingredient of a concept`: **GET** `{{rxnavBase}}/rxcui/{{rxcui}}/related.json`, **Params**
   `tty` = `IN`. **Save & test** with the code the first test returned.

### Collection 2: drug safety, with paging

1. **New collection** `Drug safety (openFDA)`, **Public**, **Scheme** **None**. Environment `Public` (**Default**),
   variable `fdaBase` = `https://api.fda.gov`.
2. **Add API** `openFDA: drug recalls`: **GET** `{{fdaBase}}/drug/enforcement.json`, **Params** `search` =
   `status:"Ongoing"`.
3. **Settings**, **Paging** **Offset**: **Offset parameter** `skip`, **First offset** `0`, **Size parameter** `limit`,
   **Page size** `100`, **Total at** `$.meta.results.total`, **Items at** `$.results`, **Most pages** `5` (see
   [Page through results](#con-api-paging)). **Save & test**: "N items over P pages".

### The pipeline

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Recalls touching our medication list`,
   **Create and add steps**.
2. Add the ten steps. Step 6 is a read of its own; step 9 reads `lc` and joins `unique` to it.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `list` | **Bucket** your bucket; **File** `reference/med-list.csv` |
| 2 | Limit / top N | `first` | **Rows to keep** `40` (no more calls than you mean to make) |
| 3 | Enrich | `concept` | **API request** `RxNorm: approximate term`; **Variables** `term` = `{{medication_text}}`; **Fields** `approximateGroup.candidate[0].rxcui` as `rxcui`; **When a call fails** `null`; **At most calls** `40` |
| 4 | Enrich | `ingredient` | **API request** `RxNorm: ingredient of a concept`; **Variables** `rxcui` = `{{rxcui}}`; **Fields** `relatedGroup.conceptGroup[0].conceptProperties[0].name` as `ingredient`; **When a call fails** `null`; **At most calls** `40` |
| 5 | Remove duplicates | `unique` | **Key columns** `ingredient` |
| 6 | Read API | `recalls` | **API request** `openFDA: drug recalls`; **Rows at** `results`; **Columns** `product_description`, `reason_for_recall`, `classification`, `recall_number` (each **As column** the same name); **At most rows** `500` |
| 7 | Compute | `generic` | **Column** `generic_name`, **Formula** `regex_extract(product_description, '^([A-Za-z]+)')` |
| 8 | Transform | `lc` | **Column** `generic_name`, **Operation** `lower`, **From column** `generic_name`; **Keep the other columns** on |
| 9 | Join | `ours` | **Reads** `lc`. **Join with** `unique`; **On** `generic_name` = `ingredient`; **Keep** `inner` |
| 10 | Save File | `keep` | **File name** `recalls-for-our-medicines.csv`; **Format** `csv` |

3. **Settings**: **Data sensitivity** **Internal**. **Validate**, **Save**, **Run now**.

## Check it worked

- **Read** 40 lines; **Enrich** (concept) 40 → 40, each with an `rxcui`; **Enrich** (ingredient) 40 → 40, each with an
  `ingredient` such as `metformin` or `furosemide`; **Remove duplicates** 40 → **7** (the seven medicines the list
  names).
- **Read API** reads the recall list page by page, up to 500 rows; **Join** keeps the recalls whose first word is one
  of your seven ingredients. Their number depends on today's list; it may be 0.
- `recalls-for-our-medicines.csv` on the **Outputs** tab: one row per matching recall, its reason and class beside the
  ingredient.

Summit Valley's two pipelines: the RxNorm one read 40 lines and kept 7 ingredients; the recall one read 100 recalls and
26 named a medicine on its 400-item formulary, and went to its pharmacists as a report.

## Common mistakes

- **`rxcui` is empty on every row.** The **Fields** path is the answer's exact shape:
  `approximateGroup.candidate[0].rxcui`. Run **Save & test** on the request and read where the code sits.
- **Some lines have no ingredient.** The first call found no concept for that line (**When a call fails** `null` keeps
  the row with the field empty), so the second had nothing to ask. Look at its `medication_text`: a misspelt name has
  no match.
- **Fewer recalls than you expected.** The request's **Paging** decides how many pages are read; **At most rows** only
  stops the step earlier. Check **Most pages** and **Items at** (`$.results`), and read the test's "N items over P
  pages".
- **Too many calls.** Each **Enrich** makes one call per row, at most 500 a step; **Limit / top N** before it keeps a
  big file from making thousands. Public services may also slow you down when called too fast.
- **The join keeps nothing.** Both sides must be in lower case: the recall list writes `METFORMIN`, RxNorm writes
  `metformin`. Keep the **Transform** step.
