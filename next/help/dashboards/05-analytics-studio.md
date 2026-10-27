---
id: dash-studio
title: Explore a file in Analytics Studio
summary: Open a file or a folder as a dataset, preview and profile it, group and measure it, write a query, save it for a board, and export the result.
section: Analysis
who: Anyone whose page access includes Analytics Studio
where: See results › Analysis › Analytics Studio (/data/analytics)
related: dash-build, dash-catalog, dash-files, dash-ask-pin
popular: Group and count a file's rows
---
Analytics Studio reads a file where it lives, in your workspace's storage: nothing is copied. The query engine reads
the file and your browser only ever receives a page of rows, so a file of millions of rows opens as quickly as a small
one. What you save here (an analysis or a query) is what a dashboard widget points at.

## Open a file
1. Open **See results › Analysis › Analytics Studio** and choose **Choose a file**.
2. In the **Files** panel, pick the **Connection**, walk to the folder and pick a file. CSV, TSV, JSON and Parquet can
   be read. A whole folder can be read as one dataset: it is marked **Folder dataset**, and every figure covers all the
   files in it.
3. The header shows the file's name, its format, its rows, columns, size and when it last changed, and where it lives.

You can also arrive here from **Open in Analytics Studio** on an Ask your data answer. Not sure where a file is? Choose
**Find it in the Data Catalog** and search there.

> **Tip:** ⋯ › **Name this dataset** registers the location under a name of its own, so it can be opened by name. It
> reads no rows.

## Look at it
The tabs are in three groups, by what each costs:

| Tabs | What they show |
|---|---|
| **Overview**, **Data** | The file's columns and a page of its rows. **Data** sorts, filters and pages through the rows. |
| **Compact**, **Profile**, **Quality** | One scan of the whole file, read three ways: each column's type, how many are empty and distinct, the most common values, and what looks wrong. The scan runs once, on the first of these you open. |
| **Canvas**, **SQL**, **Charts**, **Activity** | Questions you ask the file. Each run is a real query. |

**Visualise** (beside **Files**) suggests charts of the file from its columns; a chart there can be pinned to a
dashboard.

![Analytics Studio](dash-studio "Analytics Studio: a file's facts, the tabs in three groups, and the Profile of its columns")

## Group and measure (Canvas)
1. Open **Canvas**. Under **Build an analysis**, pick a **Dimension** (a column to group by). Up to three: each next
   one appears as **then by**.
2. For a date column, pick a **Bucket**: **every value**, **by day**, **by week**, **by month**, **by quarter** or
   **by year**.
3. Pick a **Measure**: **Count rows**, **Count non-null**, **Distinct count**, **Sum**, **Average**, **Minimum**,
   **Maximum** or **Median**, and the column it measures.
4. Choose **Run analysis**. The result shows as a table or a chart.
5. **Save analysis** keeps it under a name, for a dashboard widget. Saving a changed one again updates it; **Save as
   new** keeps both.

## Write a query (SQL)
1. Open **SQL**. **What your SQL can name** lists the dataset as `dataset` (and a second one, if you add it, as
   `dataset2`). You never type a bucket or a path.
2. Write the statement and choose **Run** (or press ⌘ / Ctrl + Enter).
3. Type a name under **Name this query** and save it, for a dashboard widget.

```A first query
select * from dataset
```

## Take the result away
Under a result, **Take it away** offers:

- **Download** as **CSV**, **TSV** or **JSON**. The query runs again to build the file.
- **Write back**: the result as a new file in the same connection's bucket, in the folder you type. There is no undo.

> **Warning:** A result that stopped at the server's row ceiling says so above the buttons. A file made from it holds
> only that part, not all of it.

## Limits
| What | Limit |
|---|---|
| File formats | CSV, TSV, JSON, Parquet |
| Grouping | Up to three dimensions and one measure |
| Rows a result returns | The server's row ceiling; the screen says when a result stopped at it |

Every query here is metered as an analytics query (see [How usage is counted](#bill-usage)).

## Example
Claire Martin, controller at Summit Valley Health System, opens `rcm/kpis.csv`, groups by **month** of `posted_at` and
measures **Average** of `days_in_ar`. She saves it as *Days in A/R by month*, and Marcus Owens adds it to **Revenue
cycle** as a line.
