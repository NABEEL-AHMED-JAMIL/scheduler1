---
id: rs-pdf-archive
title: PDF/A for archiving and tagged PDF for accessibility
summary: Make a template's reports PDF/A-2b, the archival format for records kept for years, and tagged PDFs a screen reader can read.
section: Design
who: Edit templates; Manage branding for a brand profile's setting
where: Reports › Templates (/reports/templates); Reports › Assets & branding (/reports/assets)
related: rs-designer, rs-branding, rs-approve
---
Two settings change what kind of PDF a template makes. Both are still PDFs: every reader opens them as before.

- **Archive format: PDF/A-2b** — the archival PDF (ISO 19005-2) for records kept for seven years or more: every font is
  embedded, the colours are described, and the file says it is PDF/A. When the report is approved, its signature is
  added without changing anything before it, so the signed PDF is still PDF/A.
- **Accessible: tagged PDF** — the report's headings, paragraphs, tables and lists are tagged in reading order, each chart
  and picture carries its description (the chart's own words for screen readers), and the file names its language and
  title. A screen reader reads it as a document, not as loose words — useful for letters to patients.

## Set it for a template
In the designer, click an empty part of the page; under **Archive and accessibility**:

- **Archive format**: **As the brand profile says**, **A plain PDF**, or **PDF/A-2b, for records kept for years**.
- **Accessible**: **As the brand profile says**, **Tagged PDF, read by screen readers**, or **Not tagged**.

Publish the template; the reports made from it from then on follow the setting.

## Set it for every template of a brand
In **Reports › Assets & branding**, open a brand profile and turn on **Archive format: PDF/A-2b** and **Accessible: tagged
PDF**. Every template that uses the profile and says nothing of its own follows it; a template's own choice wins.

## Good to know
- A report made as PDF/A that could not be made so (a font that cannot be embedded) fails with the reason, rather than
  being stored as something it is not.
- A very long table (more than 1,000 rows) is drawn after the other pages without tags: the checks say so, and lowering
  the table's **At most rows** keeps it tagged.
- The HTML of a report is unchanged by these settings.
- These files are checked by the service when they are made; for a formal conformance report, open them in a PDF/A
  validator such as veraPDF.
