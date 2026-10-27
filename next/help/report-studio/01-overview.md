---
id: rs-overview
title: Report Studio at a glance
summary: What Report Studio makes, its six tabs, who may do what, and the path from a template to a signed PDF.
section: Get started
who: Anyone whose page access includes Reports overview; each tab needs its own page (see the table below)
where: See results › Reports › Overview (/reports/overview)
related: rs-templates, rs-create, rs-approve, rs-limits
aliases: reports
popular: Make your first signed report
---
Report Studio turns your data into finished, branded reports: a discharge summary for one patient, a monthly medication
safety report for a pharmacy, a statement for each guarantor. You design a **template** once, fill it with data from a
pipeline's run, a file or a sample, and every time you generate it you get a new **version** with its PDF and HTML.
Nothing is overwritten. A person approves a version, and the approval signs the PDF digitally in their name, so anyone
can check later who approved it and that it has not changed since.

In the menu it is **See results › Reports**.

![The Reports overview](rs-overview "Reports › Overview: this month's versions, templates waiting to be published, recent reports and generation jobs")

## The workflow
1. **Brand it once.** Upload your logo, letterhead, signatures and stamps in **Assets & branding**, and make a brand
   profile so every report has the same header, footer, colours and logo. See [Branding and assets](#rs-branding).
2. **Make a template.** Start from a starter or your own on **Templates**, lay it out in the designer and try it with
   test data. See [Templates and the library](#rs-templates) and [The designer](#rs-designer).
3. **Publish it.** A published version never changes; reports always record the exact version they were made from.
4. **Generate.** By hand with **New report** ([Create a report](#rs-create)), or on every run of a pipeline with a
   **Generate report** step ([Reports from a pipeline](#rs-pipeline)).
5. **Approve and sign.** Someone allowed to approve, who did not generate that version, chooses **Approve and sign**.
   See [Approve, sign and verify](#rs-approve).
6. **Share, verify, keep.** Download the PDF, check its signature with **Verify signature**, and let the workspace's
   retention rules decide how long older versions stay ([Retention and page limits](#rs-limits)).

## The six tabs

| Tab | What it is for |
|---|---|
| **Overview** | Versions made this month, published templates, how many generated without a problem, what needs attention; recent reports, generation jobs, connected pipelines and template activity |
| **Templates** | Every template of the workspace and the starters: make, copy, import, publish, archive |
| **Library** | Every report and its versions, and the generation jobs; **From pipelines** lists the files pipelines made |
| **Data** | Browse what a report can read: pipeline outputs, storage buckets, uploads; see a schema and the first rows |
| **Assets & branding** | Logos, images, letterheads, signatures and stamps; brand profiles |
| **Settings** | Who approves reports and publishes templates, two approvals, retention preview, the page limit (workspace administrators) |

## Who may do what
Each part of Report Studio is a page in page access (**Administration › Page access**), so an administrator can give a
reviewer the Library and approval without letting them change templates.

| Page in page access | Lets a person |
|---|---|
| **Reports overview** | open Report Studio and its Overview |
| **Report templates** | make and edit templates and drafts |
| **Publish report templates** | publish a draft (or decide a request to publish one) |
| **Report data** | browse and upload report data on the Data tab |
| **Generate reports** | create reports and generate new versions |
| **Reports** | read the Library and download reports |
| **Report assets and branding** | upload logos and images, edit brand profiles |
| **Upload signatures and stamps** | upload, replace and retire signatures and stamps |
| **Approve and sign reports** | approve report versions (signing them) and approve signatures and stamps |

Workspace administrators have all of them. **Settings** is for workspace administrators only.

> **Note:** Whoever generated a version never approves it, and whoever uploaded a signature or stamp never approves it.
> Give the workspace at least two people who may approve.

## Example
At Summit Valley Health System (a fictional hospital group), the admission pipeline's last step makes Elena Marsh's
**Discharge summary** from the care team's approved draft. Dr. Minh Nguyen, standing in for Dr. Anika Patel, chooses
**Approve and sign**; the PDF now carries his digital signature, the records stamp and a QR code that opens the
report's page for anyone signed in to check it.
