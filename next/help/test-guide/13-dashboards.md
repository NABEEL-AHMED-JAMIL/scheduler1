---
id: qa-dashboards
title: "Test area 13: dashboards and analysis"
summary: Reading, filtering and sharing a board, building one, Analytics Studio, Ask your data and its search, the Data Catalog, and masked values for a viewer and a researcher.
section: Results
who: Testers; A builds, V and RS read, with X for isolation
where: See results › Dashboards (/data/analytics/dashboards); Analysis › Analytics Studio (/data/analytics); Analysis › Ask your data (/data/ask); Analysis › Data Catalog (/data/catalog)
related: dash-boards, dash-build, dash-data-sources, dash-ask-pin, dash-studio, dash-catalog, ai-ask-data, sec-data-policies
popular: Test masking for a viewer and a researcher
---
These checks cover the results side: dashboards and their filters and links, building a board, exploring a file in
Analytics Studio, asking questions of the data, and the Data Catalog. They test **masking** on purpose: a column the
Data Catalog marks sensitive (a name, a date of birth, a record number) is masked for anyone without access, on a
board, in Analytics Studio, in exports and in Ask your data, until an administrator grants access for a time.

**Before you start:** a synthetic file in storage with a sensitive column, such as `qa/patients.csv` with `mrn`,
`name`, `dob`, `ward` and `los_days` (made-up rows only), and a board that reads it (you build one in QA-13.08). The
researcher account RS and the viewer V.

Tested by ______ on ______

## Read, filter and share
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-13.01 | Find a board | As A, **See results › Dashboards** | Cards grouped: **Favourites**, then one group per pipeline that feeds boards, then **Not fed by a pipeline**; each card with its widgets, files, who made it and when | ☐ Pass ☐ Fail |
| QA-13.02 | Where its data comes from | Open a board fed by a pipeline | The facts line names **Made by** the pipeline and its newest run, linked to the run's page; **Files this board reads** lists the files | ☐ Pass ☐ Fail |
| QA-13.03 | The date range narrows it | Pick **30 days** on the filter bar | Each widget whose data has the date column runs again and says **Filtered**; one without it says **Not by** and the filter's name | ☐ Pass ☐ Fail |
| QA-13.04 | Click a bar to filter | Click one bar of a chart | The whole board narrows to that value; the facts line shows **N filters on**; the × clears it | ☐ Pass ☐ Fail |
| QA-13.05 | The view is in the address | Copy the address with a filter on; open it in a new tab | The board opens with the same filter | ☐ Pass ☐ Fail |
| QA-13.06 | Share a board with a colleague | Send the address to V; V opens it | V sees the same board and filters, run as V | ☐ Pass ☐ Fail |
| QA-13.07 | A viewer cannot change a board | As V, look for **New dashboard** and a widget's edit menu | Neither is offered; the page says V can open, run and filter, and that changing boards needs **Edit dashboards** | ☐ Pass ☐ Fail |

## Build
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-13.08 | Save an analysis | As A, **Analysis › Analytics Studio** › **Choose a file**: `qa/patients.csv`; **Canvas**: **Dimension** `ward`, **Measure** **Average** of `los_days`; **Run analysis**; **Save analysis** `QA LOS by ward` | The result shows one row per ward; the analysis is saved | ☐ Pass ☐ Fail |
| QA-13.09 | Make a board with it | **Dashboards** › **New dashboard** `QA board`; ⋯ › **Add a widget**: **Shows** **A saved analysis**, `QA LOS by ward`, a bar chart; **Add** | Only the new widget runs; it shows the wards | ☐ Pass ☐ Fail |
| QA-13.10 | A table widget of the file | Save a query `select * from dataset` in **SQL** as `QA patients`; add it as a table widget | The table pages, sorts and offers **Search the rows**, **Columns** and **Export CSV** | ☐ Pass ☐ Fail |
| QA-13.11 | A filter bar | ⋯ › **Add a filter bar**: **Add a filter**, **Label** `Ward`, the dataset and column `ward`; **Save filters** | The bar shows **Ward**; ticking a value narrows both widgets | ☐ Pass ☐ Fail |
| QA-13.12 | Deleting a board keeps the saved work | Make a second board with one widget; ⋯ › **Delete this dashboard** | The board is gone; `QA LOS by ward` is still in Analytics Studio | ☐ Pass ☐ Fail |
| QA-13.13 | Pin an answer | **Ask your data**: "Average los_days by ward in qa/patients.csv"; **Pin to dashboard** › **An existing dashboard** `QA board`; **Pin** | **Pinned to** the board; the board shows the tile, which runs its query when the board opens | ☐ Pass ☐ Fail |
| QA-13.14 | No pinning without dashboard editing | As RS (no **Edit dashboards**), ask a chart question | **Pin to dashboard** is greyed out | ☐ Pass ☐ Fail |

## The Data Catalog and masking
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-13.15 | The catalog | As A, **Analysis › Data Catalog** | The figures count **Assets**, **With sensitive fields**, **Stale over 30 days**, **Without an owner**; `qa/patients.csv` is listed | ☐ Pass ☐ Fail |
| QA-13.16 | Sensitive columns are found | Open `qa/patients.csv`'s panel; **Scan for sensitive data** | `mrn`, `name` and `dob` are marked as holding a medical record number, a person name and a date of birth (mark any it missed by hand under **Holds**, then **Save details**); the asset's sensitivity reads **Restricted** | ☐ Pass ☐ Fail |
| QA-13.17 | Masked for the researcher | As RS, open the asset in the Data Catalog, then in Analytics Studio (**Data** tab) | The panel says *Its sensitive values are masked for you*; the `mrn`, `name` and `dob` values are masked; `ward` and `los_days` are not | ☐ Pass ☐ Fail |
| QA-13.18 | Masked on a board and in its export | As V (or RS), open `QA board`'s table widget; **Export CSV** | The sensitive columns are masked on screen and in the file | ☐ Pass ☐ Fail |
| QA-13.19 | Masked in Ask your data | As RS, **Ask your data**: "List the names of the patients in qa/patients.csv" | Names are not shown in the answer or its rows | ☐ Pass ☐ Fail |
| QA-13.20 | Ask for access | As RS, in the asset's panel: **Why you need it** `QA check`, **For** **1 day**; **Request access** | The panel says when RS asked; A has the request to decide | ☐ Pass ☐ Fail |
| QA-13.21 | Access granted for a time | As A, approve it in **Review**; as RS, open the asset again | The panel says *You can see its values until* the end; the values show for RS until then, and are masked again after | ☐ Pass ☐ Fail |

## Ask your data and its search
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-13.22 | What is searched | As A, **Ask your data** | The badge says what is searched (for example *Searching 3 documents, 7 pipeline results and 6 forms*) | ☐ Pass ☐ Fail |
| QA-13.23 | An answer from documents cites them | Ask a question a document or a form answers (for example about a referral of [QA-05](#qa-documents)) | The answer has numbered citations; each source links to its document or form with the passage | ☐ Pass ☐ Fail |
| QA-13.24 | Each person finds only what they may open | As RS, ask the same question | RS gets no answer from documents RS's access does not open | ☐ Pass ☐ Fail |
| QA-13.25 | The search index (administrators) | As A, the **Search index** card on **Ask your data** (marked **Workspace admins**): **Add folder**, pick a folder; **Save**. As RS, look for the card | A is told *Search index saved* and the card counts **Documents**, **Form records**, **Files** and **Passages**; RS has no such card; answers still come only from what the asker may open. With no index on the platform the card says every question reads your sources live | ☐ Pass ☐ Fail |

## Isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-13.26 | Another workspace cannot open a board | As A, copy `QA board`'s address; as X, open it | **This dashboard isn't here**: it may have been deleted, or the link belongs to another workspace | ☐ Pass ☐ Fail |
| QA-13.27 | Another workspace's catalog | As X, **Data Catalog**, search `patients` | A's `qa/patients.csv` is not listed | ☐ Pass ☐ Fail |
| QA-13.28 | Another workspace's questions | As X, **Ask your data** about `qa/patients.csv` | Nothing of A's file is found or counted | ☐ Pass ☐ Fail |

![The Data Catalog as a researcher](qa-catalog-masked "The Data Catalog as the researcher sees it: which assets hold sensitive fields, what those fields hold, and each asset's sensitivity")

## Example
At Summit Valley Dr. Hana Ito opens the Patient 360 file: its `name`, `dob` and `mrn` columns are masked for her. She asks
for 7 days' access *to check the ages in the diabetes cohort*; once the administrator approves it, she sees the values
for a week, then they are masked again.
