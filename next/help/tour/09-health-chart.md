---
id: tour-health-chart
title: The health chart
summary: One report brings every stage of the stay together: timeline, vitals, labs, imaging, medicines, care plan and discharge.
section: Discharge and results
who: Anyone whose page access includes Reports › Library reads it; running the pipeline needs Run now on its schedule
where: See results › Reports › Templates (/reports/templates); See results › Reports › Library (/reports/library)
related: tour-discharge, tour-dashboard
---
Each pipeline in the journey kept its own part of the story. The health chart puts them back together in one report, so
a clinician reading Elena's stay does not have to open fifteen runs. (Fictional patient, synthetic data.)

## How it is made
1. The pipeline **Journey 14 · The patient's health chart (Patient 360)** runs on demand, with three parameters: the
   record number (`mrn`), and the first and last day of the period (`from`, `to`).
2. It reads the runs of the journey's pipelines and the files they kept in the journey's folder (progress, labs,
   imaging), keeps only the rows for that patient, and labels each row with the stage it came from.
3. Its last step generates a report from the published template **Patient health chart**, "Every stage of one
   patient's journey in one chart": a timeline of the stages, a chart of the vital signs, the lab results as a table,
   the wound photos and X-ray with their measurements, the medicines, the care plan and the discharge.
4. The report is a new version in **Reports › Library**, like any other, and can be sent for approval and signed.

![The health chart in the Library](tour-health-chart "Reports › Library: Elena Marsh's health chart, made from the Patient health chart template")

## Limits that apply
- Every page counts toward the workspace's page limit for one report (300 unless an administrator set fewer). A long
  stay with many readings can reach it; the message then says what to do.
- Pictures are read from the bucket by their key. A missing picture prints as a placeholder and the run says so with a
  warning; see [A missing picture or field](#ts-documents--a-missing-picture-or-field).

## Where to see it
- **Reports › Templates**: the template, its versions, its test samples and **Data it needs**, the fields a report
  must have.
- **Reports › Library**: the chart, its versions and its PDF.

## Learn more
The Report Studio topic explains templates, repeating sections, charts and pictures from your data; start with
[Report Studio at a glance](#rs-overview). Next:
[the dashboard](#tour-dashboard).
