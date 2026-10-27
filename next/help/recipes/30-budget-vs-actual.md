---
id: rcp-budget-vs-actual
title: Budget against actual spend by cost centre
summary: Turn a budget sheet with a column per month into rows, join the actuals, work out each variance and make a monthly report named after the month you choose.
section: Other industries
who: A workspace administrator builds it; anyone who may open the schedule runs it with another month
where: Build › Pipelines (/pipelines/list); Build › Pipelines › Schedules & triggers (/pipelines/schedules); Reports › Library (/reports/library)
related: step-combine, pl-placeholders, trg-run-now, step-outputs, rs-overview
popular: Turn columns into rows
---
Finance keeps the year's budget as a sheet: one row per cost centre, one column per month. The actuals arrive as rows:
a cost centre, a month and what was spent. To compare them, the budget must be turned into rows too. This recipe does
that with **Unpivot**, joins the actuals, works out the variance in per cent, keeps the largest overspends and makes a
report named after a **Month** parameter, so the controller can run it for any month with **Run with…**.

> **Note:** The cost centres and amounts are synthetic.

## What you'll build

A pipeline **Budget vs actual by cost centre** with a run parameter `month`, eight steps and a monthly schedule on day
3 at 06:00. It keeps `budget-vs-actual.csv` and a report **Budget vs actual · 2026-10** in **Reports › Library**.

![The pipeline's steps](rcp-x-budget-steps "Summit Valley's Budget vs actual: the wide budget unpivoted, joined to the actuals, the variance worked out, the top rows reported")

## What you need first

1. **A storage connection**, *your bucket* (see [Connect your storage](#con-storage)).
2. The sample files, in a folder `finance/budget/` of your bucket (**See results › Analysis › Files**, see
   [Files](#dash-files)):
   - [budget.csv](/help/samples/budget-vs-actual/budget.csv): 10 cost centres, the columns `cost_centre`, `name`, then
     `jan` to `dec`.
   - [actuals.csv](/help/samples/budget-vs-actual/actuals.csv): 120 rows, `cost_centre`, `month` (`jan` … `dec`),
     `actual`.
3. Access to **Reports** for the report part (see [Report Studio at a glance](#rs-overview)).

## Build it

### The parameter and the steps

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Budget vs actual by cost centre`, **Create
   and add steps**.
2. On the **Settings** tab, under **Run parameters**, choose **Add a parameter**: **Name** `month`, **Type** **Text**,
   **Label** `Month`, **Default** `2026-10` (see [Run parameters](#pl-placeholders--run-parameters)).
3. On the **Steps** tab, add the first seven steps. Step 3 reads a file of its own; step 4 reads `long` and joins `act`.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `budget` | **Bucket** your bucket; **File** `finance/budget/budget.csv` |
| 2 | Unpivot (columns to rows) | `long` | **Columns to turn into rows** `jan` to `dec` (all twelve); **Name column** `month`; **Value column** `budget` |
| 3 | Read CSV/JSON/Parquet | `act` | **Bucket** your bucket; **File** `finance/budget/actuals.csv` |
| 4 | Join | `vs` | **Reads** `long`. **Join with** `act`; **On** `cost_centre` = `cost_centre` and `month` = `month`; **Keep** `left` |
| 5 | Compute | `var` | **Column** `variance_pct`, **Formula** `round((actual - budget) * 100 / budget, 1)` |
| 6 | Limit / top N | `top` | **Rows to keep** `10`; **Top N by** `variance_pct` `desc` |
| 7 | Save File | `keep` | **File name** `budget-vs-actual.csv` |

4. **Validate**, **Save**, then **Run now** once: the report designer in the next part opens with this run's rows.

### The report

1. Add **Generate report**, **Key** `report`, after step 7. Under its report design choose **Design the report here**,
   then **Design the report**. The designer opens with the rows of the run you just made.
2. Lay out the page: a heading, and a table of `cost_centre`, `name`, `month`, `budget`, `actual` and `variance_pct`.
   Choose **Publish v1** (see [Templates and the library](#rs-templates)). Back in the step, **Version the step runs**
   reads **The latest published version**.
3. **Report name** `Budget vs actual · {{param.month}}`; **Period** `{{param.month}}`. **Apply**, **Save**.
4. **Schedule**: **On a timetable**, **Monthly**, every 1 month on day `3` at `06:00`, **Create schedule**.

## Check it worked

Run it from the schedule's **⋮** menu with **Run with…**, **Month** `2026-10` (see [Run with…](#trg-run-now)):

| Step | Rows in → out |
|---|---|
| Budget | 0 → 10 |
| Unpivot | 10 → **120** (10 cost centres × 12 months) |
| Actuals | 0 → 120 |
| Join | 120 → 120 |
| Compute | 120 → 120 |
| Limit / top N | 120 → 10 |
| Save File | 10 |
| Generate report | 10, one report |

The first rows of `budget-vs-actual.csv`: `CC-07` (HR) in `oct` at 19.9 %, `CC-02` (ICU) in `jun` at 19.5 %, `CC-08`
(IT) in `oct` at 19.3 %. **Reports › Library** holds **Budget vs actual · 2026-10**, version 1.

![The run's steps](rcp-x-budget-run "Summit Valley's run for month 2026-10: 80 cost centres, 960 rows, the top 40 in the report")

Summit Valley's sheet has 80 cost centres: 960 rows after **Unpivot**, the 40 largest variances in its report.

> **Note:** Not yet verified end to end with **Design the report here**. Summit Valley's run used a saved **Budget vs
> actual** template (**Use a saved template**). The parameter names the report and its period; it does not filter the
> rows, so every run compares the whole year.

## Common mistakes

- **Unpivot makes 10 rows, not 120.** **Columns to turn into rows** must list all twelve month columns by their exact
  names.
- **`actual` is empty on every row.** The join needs both pairs, `cost_centre` and `month`, and the month written the
  same way in both files (`oct`, not `Oct` or `2026-10`).
- **The report step says "Not published yet: the step cannot run it".** Publish the design in the designer first.
- **Design the report says "Save the pipeline first".** Save, then choose it again.
- **You want one month only.** Add a **Filter** on `month` after the join, with the value the month's short name
  (`oct`).
