---
id: rs-components
title: Charts, tables, QR codes, barcodes and other components
summary: Every component the designer offers, with what it shows and its limits — tables, charts, range bars, images, conditions, repeats, Contents, QR codes and barcodes.
section: Design
who: Anyone who may edit the template's draft
where: Reports › Templates (/reports/templates)
related: rs-designer, rs-approve, rs-limits
popular: Add a chart to a report
---
Components are the blocks a template is made of. Each reads data through its **binding** (a path such as
`primary.labs`) and has its own settings on the right of the designer.

## Text

| Component | What it shows |
|---|---|
| **Heading** | A title, level 1 to 3, typed or bound to a field |
| **Text** | Paragraphs with `{{data.paths}}` filled in; simple Markdown (bold, italic, bullets); up to 10,000 characters |
| **Label and value** | A label and one bound value, formatted (currency, number, date …) |
| **List** | Bullets from a list in the data, or typed items, one per line |

## Data

| Component | What it shows |
|---|---|
| **Table** | The rows of a list in the data; columns with labels and formats; **Show only rows where** filters them; a long table goes on page after page, repeating its header. A column can be a **Trend line (sparkline)**: the row's list of numbers (a patient's last results) as a small line, its normal range shaded from two fields of the row |
| **Chart** | Bar, horizontal bar, stacked, line, area, pie, doughnut or scatter from a list in the data; a target line, **reference bands** (a normal range shaded behind the data, up to four), value labels and a legend; drawn as vectors, the same in the HTML and the PDF |
| **Metric** | A KPI tile: the value, its change against a previous value or a target (up or down, good or bad), thresholds and a sparkline |
| **Range bar** | One lab value against its reference range: the normal range shaded on a scale, a marker at the value, and **High**, **Low** or **Within range** in words, so it reads in black and white and on a fax. The limits are numbers or fields of the data; one may be left out (below 100, from 60) |

To make a chart: add **Chart**, bind it to a list (for example `primary.vitals`), set the category field (the time or
the name along the axis) and one or more series fields, and pick the chart type. Under **Reference bands**, add the normal
range (for HbA1c, From 4.0 To 5.6, green) and a caution range if there is one (5.7 to 6.4, amber); the chart says each band
in its text for screen readers too.

### Tables across pages

In the PDF a table that runs over a page starts each later page with its title and **(continued)**, then its header
(turn it off with **Later PDF pages start with "(continued)"**). It never leaves one row alone: not its first row at the
foot of a page (the table starts on the next page) and not its last row on a page of its own. Under **Group rows by**,
**Header row** puts a row with the group's value before each group, repeated "(continued)" where a page breaks inside it,
and **Keep each group on one page** moves a group that fits a page to the next page instead of splitting it. The HTML has
no pages, so it is not affected.

![A chart's settings](rs-chart "A Chart component selected: its list, category and series fields on the right")

## Media and approval

| Component | What it shows |
|---|---|
| **Image or logo** | An approved logo or image from Assets & branding; the template pins its version |
| **Image from data** | The picture a field names (a bucket file or a run's file), read as the person generating, re-encoded to its printed size; when it is missing, a placeholder or nothing |
| **Image grid** | A picture per item of a list, 1 to 6 to a row, with a caption; rows never split across pages |
| **Approver's signature** | The signature of whoever approves the version: at approval, that person's own latest approved signature, their name, the title on their signature and the time; with no signature of their own, their typed name and "Signed digitally". **Whose signature** picks the approver or, with two approvals, the second approver; a stamp may stand beside it ([Approve, sign and verify](#rs-approve--the-approvers-own-signature)) |
| **Signature (fixed person)** | One person's approved signature picture, always theirs whoever approves; placed only by its owner or with their grant ([Branding and assets](#rs-branding--signatures-and-stamps)) |
| **Stamp** | An approved stamp picture (needs a grant) |

> **Warning:** Beside an approval (a "Reviewed by" or "Approved by", or an approver's signature), use **Approver's
> signature**, never a fixed person's signature: the checks warn *One person's signature beside an approval*, because
> when someone else approves, the report would show one person's signature next to another person's approval.

## Layout

| Component | What it does |
|---|---|
| **Section** | Groups blocks under an optional title |
| **Contents** | The headings that follow it, down to the level you choose, each with its page number in the PDF (and a link in the HTML). The same headings are the PDF's bookmarks; the **Outline** tab shows the page each block starts on |
| **Row and columns** | Side-by-side columns, a quarter to the whole width |
| **Show only when** | Shows its blocks only when a condition on the data holds (a value above a threshold, a flag set); the designer shows why a block is hidden |
| **Repeat for each** | Its blocks once for each item of a list (at most 1,000), bound as `item.field` |
| **Divider**, **Spacer** | A rule, vertical space |
| **Header**, **Footer**, **Page break** | Printed on every page; a new page in the PDF |

## Metadata, the QR code and barcodes

| Component | What it shows |
|---|---|
| **QR code** | **Verify this report** (this version's public verify page: anyone who scans learns whether the copy is genuine and current, never its contents), the report id, a short value from the data, or fixed text; sharp at any size |
| **Barcode** | **Code 128** (a short code on one line, for label printers and scanners at intake), **Data Matrix** (a small square) or **PDF417** (a wide stacked code that holds the most). It holds the report number, the version's **verify code** (scanned back at intake, it finds the exact version), the verify link (Data Matrix and PDF417), a value from the data you choose, or fixed text. Sized by its **module** (the narrowest bar): 0.33 mm prints and scans reliably, 0.5 mm comes through a fax. Every barcode is read back before it is drawn |
| **Page number**, **Generated at**, **Report id**, **Template version**, **Data source**, **Generated by**, **Confidentiality** | Facts of the report itself: "Generated at" is in the workspace's time zone, on a 24-hour clock; "Report id" reads like RPT-0048 · v1 |

> **Tip:** Put a **QR code** set to verify this report in the footer of anything you sign: a reader scans it and lands
> on the version's page, where **Verify signature** checks their copy ([Approve, sign and verify](#rs-approve--verify-a-signed-pdf)).

> **Warning:** Anyone who scans a printed page reads what a barcode holds, without signing in. Never put a patient's name,
> record number or date of birth in one: the barcode's inspector and the checks warn *looks like a patient's own data*.
> Encode a reference instead (a specimen or visit number), or the verify code.

The barcode's inspector shows its **Scan check** from what was drawn: the modules across, the printed size, and whether
it reads printed and faxed. A barcode wider than its column is narrowed to fit, and the check says so.

![A barcode's inspector](rs-barcode "A Barcode selected: Code 128 of the specimen's accession number, its module and the scan check")

## Limits
| What | Limit |
|---|---|
| Components in one template | 500 |
| Items in a **Repeat for each** | 1,000 |
| Characters in a barcode | Code 128: 80 (letters, digits and punctuation, no accents); Data Matrix and PDF417: 512 |
| Headings a **Contents** block lists | 300 (all are in the PDF's bookmarks) |
| Sparklines in one report | 2,000; each draws the last 60 values of its list |
| Rows a preview prints in one table | 200 (the real report prints them all, within the page limit) |
| A picture embedded in a template | 512 KB and 4,096 pixels a side |
| An uploaded asset | 10 MB |
