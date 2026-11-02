---
id: rs-versions
title: Versions, COPY, void, archive and delete
summary: Every generate is a new version; mark COPY, void a version you no longer stand behind, archive or delete a report.
section: Manage
who: Generate reports to void, archive or delete; Reports to read the Library
where: Reports › Library (/reports/library)
related: rs-approve, rs-limits, rs-create
---
A report keeps every version it ever had. Generating again never overwrites anything: it adds the next version, with
the template version and the frozen data it was made from. This is what lets a signed report stay a record.

## Read a report's versions
Open a report in **Reports › Library**. The report itself is the page: its pages down the left, the page large with zoom,
**Fit width**, page turning, **Find**, **Print** and full screen, as **PDF** or **HTML**. Above it, the life cycle:
**Generated**, **Checked**, the approval (or the **1st** and **2nd approval**) and **Delivered**, with who and when. Beside
it, the **Versions** card lists each version with its reason, when, the template version and the data's date, whether it
is **Current**, **Signed**, **Waiting**, **Superseded** or **Void**, and its downloads; click one to read it in the viewer.
**Activity** lists everything done to the report in words, with who did it:
*Approval asked*, *First approval given by …*, *Approved and signed by …*, *Approved (not signed)* with why, *Version
voided* with its reason, *Downloaded · Version 2 · PDF*, *Delivered*, *Archived*, *Deleted*. **Where version N came from**
traces the template, the data, the generation job, the approval and the report.

## Find a report in the Library
**Reports › Library** is an explorer. On the left, **Status** (Ready, Waiting for approval, Approved and signed,
Generation failed, Void), **Template**, **Category**, **Made by** (a pipeline, a schedule, a person) and **Approver**
(**Waiting for me** among them), each with its count. Above the list, the reports a day by status over the date range
(**7 days**, **30 days**, **90 days**, **12 months**, **All time** or **Custom**). Click a report to see it in the side
panel -- its pages, approval, versions, activity and next steps -- while the list stays where it is; **↑ ↓** move,
**Enter** opens, **Space** ticks. Tick reports to **Approve and sign**, **Download as ZIP** (the signed PDF where there is
one), **Archive** or **Delete** them. Test reports (from a template tagged **test**) are hidden until you tick **Test
reports** under **Hidden**.

![The Library](rs-library "Reports › Library: facets with counts, the reports a day, the list and the open report beside it")

## Mark a copy
- **Mark this version as COPY** (when you generate) prints COPY on every page of that version.
- A template's **Every download after the first says COPY** marks every download after the first.

## Void a version
Void a version you no longer stand behind, for example one made from the wrong month's data.

1. In **Versions**, choose the **⊗** button on the version (or **Mark vN VOID…** in the **⋮** menu).
2. Write **Why it is void** (required) and choose **Mark VOID**.

The version and its files are kept as they are. Every download of it from then on is a copy marked VOID with your
reason, and carries no signature; the signed original is kept and still verifies. This cannot be taken back.

## Archive and delete
- **Archive** takes a report out of the Library and keeps it, with its versions.
- **Delete** removes a report, its versions and files for good, and only while no version of it was approved: an
  approved report is a kept record, so void the version or archive the report instead. In the Library you can tick
  several reports and **Delete** them at once; approved ones are left out and say why.

> **Warning:** Delete cannot be undone. Stored files the storage does not remove stay until an operator removes them;
> the message after a delete says so.

## Good to know
- Who can see a report: everyone in the workspace who may open Reports, and no one outside it (the **Access** tab).
- **Share** gives a link to the report's page for people of the workspace; downloads are links that work for five
  minutes, for the person who asked.
- The Library pages, filters and counts on the server, so a large library opens as quickly as a small one.
