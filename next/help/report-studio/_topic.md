---
title: Report Studio
chapter: 13
part: Part VI · See results
icon: template
blurb: Design report templates once, fill them from your data, approve and sign every version.
paths: /reports/overview, /reports/templates, /reports/library
sections: Get started | Design | Data | Generate | Approve and sign | Manage | Help
---
Report Studio turns your data into finished, branded PDF and HTML reports: a discharge summary, a monthly safety report,
a statement for every guarantor. Design a template once, fill it from a pipeline's run, a file or a sample, and keep
every version. A person approves a version, and the approval signs its PDF in their name, so anyone can check later
who approved it and that it has not changed.

## Start here
1. [Brand your reports](#rs-branding) — Upload your logo and letterhead, and make a brand profile. ![](rs-assets)
2. [Make a template](#rs-templates) — Start from a starter or your own on Reports › Templates. ![](rs-templates)
3. [Lay it out](#rs-designer) — Add tables, charts and fields in the designer, with test data. ![](rs-designer)
4. [Generate a report](#rs-create) — Pick a published template and the data, check the preview, generate. ![](rs-new-mapping)
5. [Approve and sign it](#rs-approve) — Someone else approves; the PDF is signed and can be verified. ![](rs-report-page)

## Questions
### Why can't I approve a report I generated?
Whoever generated a version never approves it, so every signed report has two people behind it. Ask a colleague with
**Approve and sign reports**. See [Approve, sign and verify](#rs-approve).

### Can I change a published template?
No: a published version never changes, so every report keeps the exact version it was made from. Choose **New draft
from vN**, change the draft and publish it as the next version. See [Templates and the library](#rs-templates).

### How do I make one report for each row, such as a statement per guarantor?
In the pipeline's **Generate report** step, turn on **One report per row** and name each report from the row's columns.
See [Reports from a pipeline](#rs-pipeline).

### My report failed: "is not in this data". What now?
The template reads a field the data does not have. Choose **Fix field mapping** and match it, or add the field to the
pipeline's output. See [Report Studio troubleshooting](#rs-troubleshooting).

### How do I check that a PDF someone sent me is genuine?
Open the report and choose **Verify signature**, then **Check a file someone sent**. See
[Verify a signed PDF](#rs-approve--verify-a-signed-pdf).

### How many pages can a report have?
300 by default; a workspace administrator may set fewer, and the platform can allow up to 2,000. See
[Retention and page limits](#rs-limits).

### Can I take a report back after it was approved?
You cannot delete an approved report, but you can **Void** the version with a reason: every copy served from then on says
VOID. See [Versions, COPY, void, archive and delete](#rs-versions).

### Does the AI design reports for me?
In a draft, the AI assistant drafts a template from your words, suggests mappings and charts and explains the checks.
Nothing changes until you accept. See [The AI designer](#rs-ai-designer).

## Related
- pipelines
- approvals
- dashboards
- security
