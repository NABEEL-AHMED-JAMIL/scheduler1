---
id: rs-pipeline
title: Reports from a pipeline
summary: The Generate report step — a design inside the step or a saved template, one report per run or one per row — and where the reports go.
section: Generate
who: Anyone who may edit the pipeline; the reports are the workspace's, in Reports › Library
where: Build › Pipelines (/pipelines/list); Reports › Library (/reports/library); Reports › From pipelines (/reports/from-pipelines)
related: rs-create, rs-data, step-outputs, rs-limits
popular: Make a report on every run of a pipeline
---
A **Generate report** step makes a report every time its pipeline runs: one report per run, or one per row (a statement
for each guarantor, a report for each recording). Each report is a version in **Reports › Library**, approved and
signed there like any other, and its PDF is also kept with the run's outputs.

![The Generate report step](step-outputs "A Generate report step using a saved template: its version, report name and formats")

## Add the step
1. Open the pipeline in **Build › Pipelines**, add a **Generate report** step after the step whose rows it reports on
   (**Reads**), and open its settings.
2. Choose where the design comes from:
   - **Design the report here**: a design that belongs to this step, made from the step's own data. Save the pipeline
     first, then **Design the report**: the designer opens on the rows this step read in the pipeline's latest run.
     Publish the design for the step to run it. **Save as a template** turns it into a normal template.
   - **Use a saved template**: pick a published **Template** of the workspace.
3. **Version** (or **Version the step runs**): **The latest published version**, or a version number to pin.
4. **Report name**: placeholders fill from the run, for example `Reconciliation · {{date}}`, and with one report per row
   from the row's columns, for example `Call · {{file_name}}`. Empty: the design's name and the run.
5. **Formats**: **PDF** and/or **HTML** (as the design says when empty). **Period** is what the report covers, its
   `{{report.period}}`. **Brand profile**: empty means the workspace default.
6. **JSON columns**: columns that hold JSON text, read as the lists and objects they hold, so a table can show them.
7. **One report per row** (off by default): each row its own report, named from its columns; **At most reports** (20 by
   default) caps them.
8. **When the checks refuse it**: `FAIL_TASK` (the default: the step fails) or `CONTINUE_WITH_WARNING` (the step
   completes with no report and a warning on the run).

```Report name, one per row
Statement · {{guarantor_name}}
```

## Where the reports go
- **Reports › Library** lists each report with the template and the run it came from (**pipeline run #NNNN**).
- The run's **Outputs** tab keeps the PDF; **View** opens it in place.
- **Reports › From pipelines** lists the files recent runs made (PDFs, JSON, CSV) with their pipeline and run.
- With **Ask for approval of every new version** on (Reports › Settings), each version waits in **Review › Approvals**.

> **Tip:** A retry of a run makes only the reports it still needs: a report already made for an item whose data and
> design are unchanged is reused.

## Limits
| What | Limit |
|---|---|
| Reports one step makes | at most 200 (**At most reports** 20 by default) |
| One step's time limit | 900 seconds |
| Pages in one report | the workspace's page limit (300 unless lowered) |

When a report would pass the page limit, it is not made, and the failed job offers what applies: **Make one report per
row**, **Lower the table's rows**, **Export the data as CSV** or **Raise the limit** ([Retention and page limits](#rs-limits)).

## Example
Summit Valley's **Patient statements, one per guarantor** pipeline reads the balances, groups them by guarantor and
makes one **Patient statement** per row, named `Statement · Guarantor <name>`: one run, eighteen statements, each its
own report in the Library.
