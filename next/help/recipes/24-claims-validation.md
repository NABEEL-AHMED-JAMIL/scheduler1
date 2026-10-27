---
id: rcp-claims-validation
title: Check a claims file before it goes out
summary: Hold every line of a pipe-delimited claims file to a data contract, keep the rejects in one file and the clean lines in another, and start it when the file arrives.
section: Healthcare
who: A workspace administrator makes the contract and the pipeline; anyone with File drop puts the file in
where: Connections › Data contracts (/connections/contracts); Build › Pipelines (/pipelines/list); Documents › Intake › File drop (/documents/intake/file-drop)
related: con-contracts, step-check, step-shape, trg-file, doc-file-drop
---
A billing system exports the day's claims as one file, a line per claim, fields separated by `|`. Before the file goes
to the clearinghouse, every line should carry a claim id, a member id, a payer, a procedure code and a billed amount.
This recipe holds each line to a **data contract**, writes the lines that fail to `rejects.csv` for the billing team
and the rest to `clean.csv`. It starts by itself when a file named `claims-*.csv` arrives.

> **Note:** Every claim, member id and amount in the sample is synthetic.

## What you'll build

- A data contract `claim_line` that says what a claim line must carry.
- A pipeline **Claims file validation** of seven steps: read the file, make `billed` a number, check each line, then
  two branches: the rejects to one file, the clean lines to another.
- A schedule that starts it whenever a matching file is dropped in the workspace's inbox.

![The pipeline's steps](rcp-x-claims-steps "Summit Valley's Claims file validation: Validate flags each line, then one Filter keeps the rejects and another the clean lines")

## What you need first

1. **Page access** to **Data contracts**, **Pipelines**, **Schedules & triggers** and **File drop**; a workspace
   administrator for the contract and the pipeline.
2. **The File drop set up** to a storage connection (**Get data in › Documents › Intake › File drop**, see
   [The file drop](#doc-file-drop)).
3. **The sample files**:
   - [claims-20261026.csv](/help/samples/claims-validation/claims-20261026.csv): 500 claim lines, pipe-delimited, with
     the columns `claim_id`, `mrn`, `member_id`, `payer`, `cpt`, `icd10`, `service_date`, `billed`, `units`. 21 lines
     have no billed amount or the text `TBD` instead of one.
   - [claim_line-sample.json](/help/samples/claims-validation/claim_line-sample.json): one claim line as JSON, for the
     contract.

## Build it

### The data contract

1. Open **Get data in › Connections › Data contracts** and choose **New from sample**.
2. **Name** `claim_line`; **Direction** *In: a customer's payload*; **Sensitivity** `sensitive`.
3. Paste the contents of `claim_line-sample.json` into **Sample** and choose **Propose schema**. The fields are listed:
   `claim_id`, `member_id`, `payer` and `cpt` as text, `billed` as a number.
4. Tick **Required** on all five, leave **Make it the active version** ticked, and choose **Save v1** (see
   [Data contracts](#con-contracts)).

```The contract's sample (claim_line-sample.json)
{
  "claim_id": "CLM-000001",
  "member_id": "SVH-300011",
  "payer": "Summit Mutual (fictional)",
  "cpt": "99213",
  "billed": 125.5
}
```

### The pipeline

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Claims file validation`, **Create and add
   steps**.
2. Add the steps in order. Step 6 reads the Validate step, not the step just before it: set its **Reads** to `check`.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `claims` | **Bucket** and **File** empty (the file the run was started for); **Format** `csv`; **CSV delimiter** `\|` |
| 2 | Transform | `amounts` | **Column** `billed`, **Operation** `cast`, **From column** `billed`, **Cast to** `number`, **Empty when it cannot cast** on; **Keep the other columns** on |
| 3 | Validate | `check` | **Contract** `claim_line`; **Rows that do not hold** `flag` |
| 4 | Filter | `bad` | **Column** `_valid`, **Is** `eq`, **Value** `false` |
| 5 | Save File | `rejects` | **File name** `rejects.csv`; **Format** `csv` |
| 6 | Filter | `good` | **Reads** `check`. **Column** `_valid`, **Is** `eq`, **Value** `true` |
| 7 | Save File | `clean` | **File name** `clean.csv`; **Format** `csv` |

3. On the **Settings** tab, **Data sensitivity** **Sensitive**.
4. **Validate**, then **Save**.

### Start it when the file arrives

1. Choose **Schedule** on the pipeline's page. **Schedule name** `Claims file validation`; **When it runs** **Only when
   started**.
2. Under **Also starts when**, tick **A file arrives**. **Which files** `claims-*.csv`; **Files per run** `1`.
3. Choose **Create schedule** (see [Start a pipeline when a file arrives](#trg-file)).
4. Open **Get data in › Documents › Intake › File drop** and drop `claims-20261026.csv` on **Drop files here**. It shows
   **Uploaded**, and the schedule starts a run.

## Check it worked

The run (**Run & review › Runs**, **Started by** a trigger) is **Completed**, 7 of 7 steps:

| Step | Rows in → out |
|---|---|
| Read the file | 0 → 500 |
| Transform | 500 → 500 |
| Validate (flag) | 500 → 500, each with `_valid` and `_errors` |
| Filter `_valid` is false | 500 → **21** |
| Save `rejects.csv` | 21 |
| Filter `_valid` is true | 500 → **479** |
| Save `clean.csv` | 479 |

Open `rejects.csv` from the **Outputs** tab: each of the 21 lines has `_errors` naming `$.billed`, the field that does
not hold.

![The run's steps](rcp-x-claims-run "Summit Valley's run: 5,000 claim lines, 33 rejects, 4,967 clean")

Summit Valley's contract is stricter (a five-digit procedure code, an amount of 0 or more): of its 5,000 lines, 33 were
rejected, for a missing procedure code or a negative amount.

> **Note:** Not yet verified end to end with this contract and the Transform step. Summit Valley's run used a contract
> with those stricter rules, made through the API, and no Transform.

## Common mistakes

- **Every line is rejected with `$.billed`.** A CSV's cells arrive as text, and the contract says `billed` is a number.
  Keep the **Transform** step that casts it before **Validate**, or make the contract from a sample whose amount is in
  quotes (`"billed": "125.50"`), which accepts any text.
- **An empty procedure code is not caught.** An empty cell is empty text, and text is what the contract asks for. A
  contract made from a sample checks that each field is there and of its type; rules such as "five digits" are not set
  from the console.
- **Every line lands in one column.** Set **CSV delimiter** to `|`: the file is pipe-delimited.
- **Both files hold every line.** The second Filter must read `check` (the flagged lines), and the Values are `false`
  and `true`, not text in quotes.
- **The drop starts nothing.** The schedule must be **Active**, **A file arrives** ticked, and the file's name must match
  `claims-*.csv`.
