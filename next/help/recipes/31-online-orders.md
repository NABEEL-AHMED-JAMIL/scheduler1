---
id: rcp-online-orders
title: Online orders from a JSON feed, one row per product
summary: Read the orders out of a nested JSON file as it arrives, split each order's product list into one row per product, and keep the order lines as a CSV.
section: Other industries
who: A workspace administrator builds it; anyone with File drop puts the feed in
where: Build › Pipelines (/pipelines/list); Documents › Intake › File drop (/documents/intake/file-drop)
related: step-read, step-shape, trg-file, doc-file-drop
---
A web shop exports its orders as JSON: the orders sit inside `data.orders`, and each order lists its products' barcodes
in one text, separated by `/`. A report on what sells needs one row per product instead. This recipe reads the orders
from inside the file, splits the barcodes into rows, and keeps the result as a CSV each time a feed file arrives. The
same pattern fits any field that packs several values into one (allergies, diagnosis codes, tags).

> **Note:** The shop, its stores and its orders are synthetic; the barcodes are public product codes with synthetic
> names.

## What you'll build

A pipeline **Online orders JSON feed** of three steps, started by each file named `orders*.json` dropped in the inbox.

![The run's steps](rcp-x-orders-run "Summit Valley's run: 200 orders read from inside the JSON file, 390 order lines after the split")

## What you need first

1. **File drop** set up to a storage connection (see [The file drop](#doc-file-drop)).
2. The sample feed [orders-2026-10-26.json](/help/samples/online-orders/orders-2026-10-26.json): 60 orders, each with
   `order_id`, `store`, `skus` and `total`. Its shape:

```The feed's shape (one of its orders)
{
 "data": {
  "orders": [
   {
    "order_id": "WEB-00001",
    "store": "SV Pharmacy North",
    "skus": "4008400402222 / 3274080005003 / 5000112548167",
    "total": 64.38
   }
  ]
 }
}
```

## Build it

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Online orders JSON feed`, **Create and add
   steps**.
2. Add:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `orders` | **Bucket** and **File** empty (the file the run was started for); **Format** `json`; **JSON rows at** `data.orders` |
| 2 | Split column | `skus` | **Column** `skus`; **Separator** `/`; **Into** `rows`; **New columns** empty; **Trim spaces** on; **Skip empty parts** on |
| 3 | Save File | `keep` | **File name** `online-lines.csv`; **Format** `csv` |

3. **Validate**, **Save**.
4. **Schedule**: **Schedule name** `Online orders`, **Only when started**; under **Also starts when** tick **A file
   arrives**, **Which files** `orders*.json`, **Files per run** `1`. **Create schedule**.
5. Drop `orders-2026-10-26.json` on **Get data in › Documents › Intake › File drop**.

## Check it worked

The run is **Completed**, 3 of 3 steps:

| Step | Rows in → out |
|---|---|
| Read the feed | 0 → 60 |
| Split column (into rows) | 60 → **129** |
| Save File | 129 |

`online-lines.csv` on the **Outputs** tab has one row per product: `order_id`, `store`, `skus` (now one barcode, the
spaces trimmed) and `total`. An order of three products is three rows, each with the order's `total` repeated, so sum
`total` per order, not per line.

![The Split column step's settings](rcp-x-orders-split "Split column: the skus column cut at / into one row per part")

Summit Valley's feed had 200 orders and 390 lines.

## Common mistakes

- **The read finds one row, or none.** **JSON rows at** must point at the list itself, `data.orders`. Empty reads the
  whole file as one value.
- **Each barcode keeps a space around it.** Leave **Trim spaces** on, or make the **Separator** ` / ` with its spaces.
- **The parts become columns, or the step asks for names.** **Into** must be `rows`. With `columns`, each part goes to
  a column of its own and **New columns** must name them all.
- **The drop starts nothing.** The pattern `orders*.json` must match the file's name, and the schedule must be
  **Active**.
