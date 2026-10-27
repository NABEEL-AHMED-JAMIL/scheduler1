---
id: dash-data-sources
title: Where a board's data comes from
summary: Pipelines keep files for a board; the board reads them where they are, names the pipeline that made them and follows each new run.
section: Dashboards
who: Workspace administrators build the pipelines that feed boards; anyone who opens a board sees where its data comes from
where: See results › Dashboards (/data/analytics/dashboards); Build › Pipelines (/pipelines/list)
related: dash-boards, dash-build, dash-studio
---
A board holds no data of its own. Its widgets read files in your workspace's storage, where they are, each time the
board is opened. Those files are usually written by a pipeline, so a board is as fresh as the last run of the pipeline
that feeds it.

## How a pipeline feeds a board
1. A pipeline reads its sources, works out the figures (for example one row per ward with its occupancy), and ends with
   an **Upload to bucket** step that writes the rows as a CSV, JSON or JSON Lines file into one of your workspace's
   buckets.
2. Give the file a fixed name, such as `ops/beds/occupancy.csv`, so each run replaces it. A name with the run's date in
   it (`census-{{date}}.csv`) keeps one file a day instead; a widget can read all of them together as one dataset.
3. In Analytics Studio, open that file and save an analysis or a query over it.
4. On the board, add a widget that shows the saved analysis or query.
5. Schedule the pipeline. Each run replaces the file, and the board shows the new figures the next time it is opened or
   run.

```A file a board reads
summit-valley/ops/beds/occupancy.csv
```

> **Tip:** Use **Upload to bucket** for a board's files rather than **Save File**. **Save File** keeps a file with the
> run only for as long as the pipeline keeps its runs' data, so a board that reads it goes empty when it expires.

## See which pipeline made a board's data
- On the cards of **See results › Dashboards**, boards are grouped under the pipeline that writes their files. A board
  no pipeline writes for is under **Not fed by a pipeline**.
- On a board, **Made by** names the pipeline and its newest run (**run #1976**), linked to that run's page; **and N
  more** says other pipelines feed it too. Point at it to list them all.
- **Files this board reads** lists every file its widgets read.

![Where the data comes from](dash-made-by "A board's facts line: Made by the pipeline and its run, and Files this board reads opened")

## When a board shows old or no figures
| What you see | What to do |
|---|---|
| **Nothing to read at** a file, *The connection worked, so check the path* | The pipeline has not written the file yet, or wrote it under another name. Open the pipeline's last run and check its **Upload to bucket** step. |
| The figures are from yesterday | The feeding pipeline has not run since. Open **Made by** and check its schedule, or run it. |
| One widget fails, the others draw | That widget's saved query no longer fits the file (a column was renamed). Its editor changes the query in Analytics Studio. |
| **This dashboard isn't open to you** | Your page access does not include Dashboards; ask your workspace administrator. |

## Example
At Summit Valley Health System, the pipeline *Bed occupancy by ward* runs every morning at 06:00. It reads the night's
census, counts beds and occupied beds per ward, works out the occupancy percentage and writes
`ops/beds/occupancy.csv`. **Bed board** reads that file in two widgets, *Occupancy by ward (%)* and *Beds occupied*, so
at 06:05 the board shows the new day. Its facts line reads **Made by Bed occupancy by ward · run #1976**.
