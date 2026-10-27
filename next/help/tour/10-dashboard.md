---
id: tour-dashboard
title: The dashboard
summary: The Patient journey board shows length of stay, readmission risk, vital signs and time per stage for the patients on the journey.
section: Discharge and results
who: Anyone whose page access includes Dashboards; changing a board needs Edit dashboards
where: See results › Dashboards (/data/analytics/dashboards)
related: tour-health-chart, tour-referral
---
The **Patient journey** board is made for a cohort: Elena and nine more fictional patients whose admissions take the
same journey, the nine started by the hospital's own system through the console's API. It shows them all together. (Fictional patients, synthetic data.)

## What feeds it
**Journey 15 · Cohort stages for the dashboard** runs every hour. It reads the runs of the journey's pipelines, turns
them into one row per patient with the time each stage ended, works out the hours to each stage and the length of stay,
adds the readmission risk from the care plans, and writes two files the board reads.

## What the board shows
The board, "The flagship: length of stay, readmission risk, vitals and time per stage (synthetic patients)", has six
tiles:

| Tile | What it answers |
|---|---|
| Patients on the journey | How many patients are on it |
| Average length of stay (days) | How long a stay lasts |
| Readmission risk (care plans) | How the care plans rate the risk |
| Hours to each stage | Where the time goes, stage by stage |
| SpO2 by day (all patients) | The oxygen saturation trend |
| Each patient's stages | A table of every patient's stages, to search and export |

![The Patient journey board](tour-dashboard "See results › Dashboards: the Patient journey board for the ten-patient cohort")

## Read it
1. Open **See results › Dashboards** and choose **Patient journey**.
2. **Files this board reads** lists where its tiles' data comes from.
3. Each tile re-runs when the board opens; **Run every widget** runs them all again.
4. A tile's own menu offers what that tile can do, such as exporting a table tile's rows.

> **Tip:** A tile that reads a file that is not there yet says "Nothing to read at ... The connection worked, so check
> the path." It usually means the pipeline that writes the file has not run yet.

## The end of the tour
From a letter in a mailbox to a board on a screen, every step was a pipeline, a person's decision or both, and each one
can be opened, checked and run again. Start building your own from [What the ETL Console does](#gs-what).

## Learn more
See [Read a dashboard](#dash-boards), [Build and edit a dashboard](#dash-build) and
[Where a board's data comes from](#dash-data-sources).
