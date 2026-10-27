---
id: rs-limits
title: Retention and page limits
summary: How many pages one report may have, what to do over the limit, and what retention removes — and never removes.
section: Manage
who: Workspace administrators set the page limit and retention; a platform administrator alone raises the ceiling
where: Reports › Settings (/reports/settings); Administration › Data policies (/administration/data-policies)
related: rs-versions, rs-pipeline, sec-retention, rs-troubleshooting
---
## The page limit
Every report has a most pages: the workspace's own, 300 unless its administrators set fewer. Every page counts, a long
table's too, in **New report**, a preview and a pipeline's **Generate report** step.

1. Open **Reports › Settings › Report size**.
2. Set **Most pages in one report** (1 up to the workspace's ceiling) and **Save**. The line under it says the limit now
   and the most this workspace may have.

Only the platform administrator can let a workspace go past 300, up to the platform's hard maximum of 2,000 pages.

### Over the limit
A report over the limit is not made. The message names the limit and who can raise it, and the failed job and the
report's page offer what applies:

- **Make one report per row**: opens the pipeline's Generate report step at **One report per row**.
- **Lower the table's rows**: opens the template in the designer on its first long table, repeat or image grid.
- **Export the data as CSV**: the run's data as a file instead of a report.
- **Raise the limit**: for a workspace administrator, opens Report size.

## Retention
How long report files stay is the class **Reports** of the workspace's retention policy, set in **Administration ›
Data policies** ([Retention](#sec-retention)). After the days you set, retention removes:

- the files of versions a newer version replaced, and
- the frozen data no kept version uses.

It **never** removes a report's current version, any approved or signed version, a version waiting for approval,
templates, assets or brand profiles. A removed version keeps its record and reads **Removed by retention**.

To see what would go before anything is removed: in **Reports › Settings › What retention would remove**, set **Older
than (days)** (365 by default) and choose **Preview**. Nothing is removed there.

## Other limits
| What | Limit |
|---|---|
| Pages in one report | 300 by default; up to 2,000 with the platform's agreement |
| A report's output file | 50 MB |
| Components in a template | 500 |
| Generating | 30 a minute a person; previews 30 a minute |
| Download links | work for five minutes |
