---
id: con-contracts
title: Data contracts
summary: Describe the records you expect, keep versions of the description, check a payload against it, and see where contracts are used.
section: Contracts and sources
who: Workspace administrators make contracts and activate versions; anyone whose page access includes Data contracts reads them and validates a payload
where: Connections › Data contracts (/connections/contracts)
related: con-sources, con-api-versions, form-starts
---
A data contract says what a record must look like: which fields it has, their types, and which ones every record must
carry. Pipelines check incoming rows against a contract, and the API refuses a record that does not meet it, so a
malformed file or message is caught where it enters instead of three steps later.

![The Data contracts tab](con-contracts "Data contracts: each one's direction, active and latest version, and sensitivity")

## The list
| Column | Says |
|---|---|
| **Contract** | Its name; a shared system contract is marked **System · read-only** |
| **Direction** | **In: a customer's payload** (what you receive) or **Out: our result** (what you send) |
| **Active** | The version checks use, unless they name another |
| **Latest** | The newest version saved |
| **Sensitivity** | The data level of what it describes |
| **Created** | When it was made |

## Start from a template
Choose **Install template** to pick one of the platform's generic contracts. A template becomes this workspace's own
contract with v1 active; change it from there.

## Make one from a sample
1. Choose **New from sample**.
2. Give it a **Name** (letters, digits, spaces, `_`, `.` and `-`), a **Direction** and a **Sensitivity**.
3. Paste a **Sample**: one record as JSON, or a list of them. Values a data policy hides are masked before the sample is
   kept.
4. Choose **Propose schema**. The console reads the sample and lists its fields with their types. Nothing is saved yet.
5. Under **Fields**, tick **Required** on each field every record must carry.
6. Choose **Save v1**.

## Versions
Open a contract to see its **Versions**, its **Schema** and **Validate a payload**.

- **New version from sample** proposes a new schema from a new sample and saves it as the next version
  (**Save version**). It does not change what checks use yet.
- **Activate** on a version makes it the one checks use. The one that was active becomes **Retired**.
- **Schema** lists the picked version's fields, types and which are **Required**; **Raw JSON** shows it as JSON
  Schema.

![A contract's panel](con-contract-panel "A contract: its versions, the active one's schema, and Validate a payload")

## Check a payload by hand
1. Under **Validate a payload**, leave **Against** at **The active version**, or pick another.
2. Paste the JSON a customer would send (or you would answer) into **Payload**.
3. Choose **Validate**. Each problem is listed by **Path**, **Rule** and **Message**. Nothing is recorded.

## Where contracts are used
- **In a pipeline**: a **Validate** step checks each row against a contract, and either fails the run or marks the
  rows that do not pass.
- **On the customer API**: a pipeline may name an input contract; a record sent to start it is checked first and
  refused, with each field's path, when it does not meet the contract. An event route may name one too. See the
  Developers chapter.
- **For forms**: a form's submission becomes a row, so the pipeline it starts can check it with a **Validate** step.

> **Tip:** A check uses the **Active** version unless it pinned another. Save a new version, try it with **Validate a
> payload**, then **Activate** it when the senders are ready.

## Example
Summit Valley's `lab_result` contract describes a lab result as nine fields, four of them required: `loinc`, `value`,
`result_id` and `patient_ref`. v2 is active and v1 is retired. The same contract is the input contract of the API the
lab partner posts results to, so a result without a LOINC code is refused before any pipeline runs.
