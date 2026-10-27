---
title: Dashboards and analysis
chapter: 14
part: Part VI · See results
icon: chart
blurb: Boards, Ask your data, Analytics Studio, the Data Catalog, files and tools.
paths: /data/analytics/dashboards, /data, /tools
sections: Dashboards | Analysis | Files and tools
---
What your pipelines produce lands in files, and this part of the console is where people read them: boards of widgets
that run again each time they are opened, questions in plain words with chart answers, Analytics Studio to explore a
file, the Data Catalog to see what data you have and who may see it, and the file browser and tools.

## Start here
1. [Read a dashboard](#dash-boards) — Open a board, narrow it by date and filters, and share it. ![](dash-board)
2. [See where its data comes from](#dash-data-sources) — The pipeline that keeps the board's files, and its last run. ![](dash-made-by)
3. [Explore a file in Analytics Studio](#dash-studio) — Preview, profile, group and query a file, and save it for a board. ![](dash-studio)
4. [Build and edit a dashboard](#dash-build) — Add widgets from saved work, pick each chart, set sections and a filter bar. ![](dash-add-widget)
5. [Put an answer on a board](#dash-ask-pin) — Ask your data in plain words and pin the chart answer. ![](dash-pin)
6. [Check what is sensitive](#dash-catalog) — The Data Catalog, masked columns and asking for access. ![](dash-catalog)

## Questions
### Why does my board show yesterday's figures?
A board reads the files its pipeline wrote, as they are now. If the pipeline has not run since yesterday, neither has
the board's data. Follow **Made by** on the board to the pipeline's last run. See
[Where a board's data comes from](#dash-data-sources).

### Why can't I change a board?
Opening, running and filtering boards needs **Dashboards** in your page access; changing them needs **Edit dashboards**
(or **Analytics Studio**). Ask your workspace administrator. See [Who may do what](#dash-boards--who-may-do-what).

### Can I share a board with someone?
Yes, with anyone signed in to your workspace who may open Dashboards: copy the board's address, filters included. It
never opens without signing in. See [Share a board](#dash-boards--share-a-board).

### Why are some values masked for me?
Those columns are marked sensitive in the Data Catalog and you have no access to them. Ask for access for a time from
the asset's panel. See [Ask for access to masked values](#dash-catalog--ask-for-access-to-masked-values).

### A widget says "Not by" a filter. Is that an error?
No. That widget's data has no column the filter can land on, so it shows everything. Its editor can list the column's
other names in the filter. See [Add a filter bar](#dash-build--add-a-filter-bar).

### How do I get an Ask your data answer onto a board?
Choose **Pin to dashboard** under its chart, and pick a board or name a new one. It reruns its query each time the
board opens. See [Put an Ask your data answer on a board](#dash-ask-pin).

### Can I download what I see?
Yes: **Export CSV** on a table widget, **Download CSV** under an Ask your data answer, and **Download** under a result
in Analytics Studio (CSV, TSV or JSON). See [Take the result away](#dash-studio--take-the-result-away).

## Related
- report-studio
- pipelines
- ai
- security
