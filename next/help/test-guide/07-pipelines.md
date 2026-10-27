---
id: qa-pipelines
title: "Test area 07: pipelines and steps"
summary: Make a pipeline, add and set up steps, try it on sample rows, validate, save versions, run it once, placeholders and run parameters, and the steps that are refused.
section: Data in and build
who: Testers; the administrator (A) builds, with R, V and X for access and isolation
where: Build › Pipelines (/pipelines/list); Build › Pipelines › New pipeline (/pipelines/new)
related: pl-overview, pl-start, pl-builder, pl-try, pl-versions, pl-settings, pl-placeholders, step-shape, step-outputs, step-glance
popular: Test a pipeline end to end on sample rows
---
These checks build one small pipeline by hand and run it, so every number is known in advance: three wards go in, their
occupancy is worked out, the full ones are kept, and a file is saved. Then they check versions, the definition as text,
placeholders, run parameters, and what may not be added.

**Before you start:** a storage connection (from [QA-04](#qa-connections)). Copy the sample rows below exactly.

```Sample rows for QA-07
[
  { "ward": "4B", "beds": 20, "occupied": 18 },
  { "ward": "ICU", "beds": 12, "occupied": 12 },
  { "ward": "5A", "beds": 24, "occupied": 10 }
]
```

Tested by ______ on ______

## Make it
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-07.01 | New pipeline offers three ways | As A, **Build › Pipelines** › **New pipeline** | **Describe it to the AI Assistant**, **Add steps yourself** and **Copy an existing pipeline** are offered side by side | ☐ Pass ☐ Fail |
| QA-07.02 | Make an empty pipeline | Under **Add steps yourself**, **Name** `QA occupancy`; **Create and add steps** | The pipeline opens on **Steps**, empty; the overview strip says what is missing | ☐ Pass ☐ Fail |
| QA-07.03 | Sample rows first | **Test with sample**; paste the sample rows; **Use these rows** | A **Sample rows** step is first, holding three rows; the console checks the pipeline at once | ☐ Pass ☐ Fail |
| QA-07.04 | Add a Compute step | **Add step from the Task Registry…**, type `compute`, pick **Compute**; **Formulas**: **Column** `pct`, **Formula** `round(occupied * 100 / beds, 1)`; **Apply** | The step is added at the end; nothing is saved yet (the save bar says there are unsaved changes) | ☐ Pass ☐ Fail |
| QA-07.05 | Add a Filter step | Add **Filter**: **Conditions** **Column** `pct`, **Is** `gte`, **Value** `80`; **Apply** | The step is in the draft after **Compute** | ☐ Pass ☐ Fail |
| QA-07.06 | Add a Save File step | Add **Save File**: **File name** `qa-occupancy-{{date}}.csv`, **Format** `csv`; **Apply** | The overview strip's **Outputs** reads **Set** | ☐ Pass ☐ Fail |
| QA-07.07 | A bad step key is refused | Open a step's panel; change **Key** to `Full Wards` | Refused: lower case letters, digits and `_` only | ☐ Pass ☐ Fail |
| QA-07.08 | Validate | **Validate** in the save bar | "The definition is valid." | ☐ Pass ☐ Fail |
| QA-07.09 | A problem is placed on its step | Clear the **File name** of **Save File**; **Validate** | The bar counts one problem; **Save File** shows a red **Problems** pill with the message. Put the name back | ☐ Pass ☐ Fail |

## Save and run
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-07.10 | Save makes a version | **Save** | The version pill reads **v1**; **History** lists v1 with **Saved** and **By** A, marked **Current** | ☐ Pass ☐ Fail |
| QA-07.11 | Run it once | **Run now** (it gives the pipeline an on-demand schedule) | The run panel lists each step with its status; **Rows in → out**: Sample rows 3, Compute 3 → 3, Filter 3 → 2, Save File 2 → 2; the run is **Completed** | ☐ Pass ☐ Fail |
| QA-07.12 | The file is named from the date | Open the run's page › **Outputs** | `qa-occupancy-` and today's date (Chicago) `.csv`, kept **With the run**; **View** shows wards 4B (90) and ICU (100) only | ☐ Pass ☐ Fail |
| QA-07.13 | A change is a new version; the run keeps its own | Change the filter's value to `95`; **Save**; open the run of QA-07.11 again | The pill reads **v2**; the earlier run still shows two rows and names the version it ran | ☐ Pass ☐ Fail |
| QA-07.14 | Discard drops unsaved changes | Change a step; **Discard** | Every tab is back as saved | ☐ Pass ☐ Fail |
| QA-07.15 | The definition as text | Open **YAML**, then **JSON** | Both show the same steps with their keys, tasks and settings as the builder | ☐ Pass ☐ Fail |
| QA-07.16 | Invalid JSON is not applied | On **JSON**, delete a closing brace; leave the tab | The builder keeps the steps it had and says why | ☐ Pass ☐ Fail |
| QA-07.17 | The flow map | **Flow** beside **List** | Each step is a box with arrows where its rows come from; clicking a box opens its panel | ☐ Pass ☐ Fail |

## Placeholders, parameters and settings
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-07.18 | A run parameter | **Settings** › **Run parameters** › **Add a parameter**: **Name** `min_pct`, **Type** **Number**, **Default** `80`; in the filter, **Value** `{{param.min_pct}}`; **Save**; run | The run keeps 4B and ICU, as with the plain value | ☐ Pass ☐ Fail |
| QA-07.19 | An unknown placeholder stays as written | Set **File name** to `qa-{{nosuch}}.csv`; **Save**; run | The kept file is named with `{{nosuch}}` left as written, so the mistake shows | ☐ Pass ☐ Fail |
| QA-07.20 | Data sensitivity shows on the list | **Settings** › **Data sensitivity** **Internal**; **Save**; open **Build › Pipelines** | The **Data** column of `QA occupancy` reads Internal | ☐ Pass ☐ Fail |
| QA-07.21 | A copy is independent | **New pipeline** › **Copy an existing pipeline**: `QA occupancy`, **Copy it**; change a step in the copy and save; open the original | The copy starts **Inactive**; the original's steps are unchanged | ☐ Pass ☐ Fail |
| QA-07.22 | A pipeline in use cannot be deleted | On **Build › Pipelines**, `QA occupancy`'s **⋮** menu | **Delete** is not offered while a schedule runs it ("In use") | ☐ Pass ☐ Fail |

## What may not be added
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-07.23 | Write Database is switched off | **Add step from the Task Registry…**, type `database` | **Read Database** is offered; **Write Database** is marked **(disabled)**, its hint: writing to a database is not part of this release, database connections are read-only | ☐ Pass ☐ Fail |
| QA-07.24 | An input too large for a calling step | Add **Call API** after the sample rows, with any saved API request, **Send** `each` and **At most calls** `2`; run; then remove the step | The step fails before any call is made: the input needs 3 calls and the step makes at most 2; the message says so | ☐ Pass ☐ Fail |

## Access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-07.25 | A viewer cannot open pipelines | As V, go to `/pipelines/list` | **Pipelines isn't part of your access**, with **Request access** | ☐ Pass ☐ Fail |
| QA-07.26 | A member cannot change a pipeline | As a member whose profile opens **Pipelines** (if your workspace has one), open `QA occupancy` | The steps can be read but not saved: building and changing pipelines is the administrators' | ☐ Pass ☐ Fail |
| QA-07.27 | Another workspace cannot open it | As A, copy the pipeline's address; as X, open it | **Pipeline #N does not exist or was deleted.** (not yet verified from another workspace) | ☐ Pass ☐ Fail |
| QA-07.28 | Another workspace's list | As X, **Build › Pipelines**, search `QA occupancy` | Not found | ☐ Pass ☐ Fail |

## Example
At Summit Valley the tester's `QA occupancy` run reads 3 rows, keeps 4B and ICU, and saves
`qa-occupancy-2026-10-27.csv` with the run. Changing the filter to 95 saves v2; the first run still names v1 and still
shows two rows.
