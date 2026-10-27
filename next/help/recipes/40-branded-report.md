---
id: rcp-branded-report
title: A branded one-page report from a sample
summary: Upload a logo, make a brand profile, lay out a template with a metric, a table and a chart, and generate it from a sample file.
section: Building blocks
who: A workspace administrator (or anyone whose page access includes Report assets and branding, Report templates, Publish report templates and Generate reports)
where: See results › Reports › Assets & branding (/reports/assets); Reports › Templates (/reports/templates); Reports › Library (/reports/library)
related: rs-branding, rs-designer, rs-components, rs-create, rcp-report-per-row
popular: Make a branded one-page report
---
This recipe builds the smallest complete Report Studio report: one page, in your colours and with your logo, showing a
headline figure, a table and a chart, made from a sample file you paste in. Once it works, the same template can be
filled from a pipeline every day (see [Statements, one per guarantor](#rcp-report-per-row)).

## What you'll build

- An uploaded **Logo** and a published brand profile, **Summit Valley standard**, that is the workspace default.
- A template, **Ward summary**, with a heading, a **Metric** tile (average occupancy), a **Table** of wards and a bar
  **Chart** of occupancy per ward.
- One generated report, **Ward summary · October 2026**, as a PDF in **Reports › Library**.

Summit Valley's own brand profile and its *Budget vs actual* template (a chart above a table) are the worked examples in
the figures.

## What you need first

- A sign-in with the pages listed under **who** above. Generating and publishing need different pages: a workspace
  administrator has them all.
- The two sample files (synthetic, fictional):
  - [summit-valley-logo.png](/help/samples/branded-report/summit-valley-logo.png): a transparent logo, 1300 × 360.
  - [ward-summary.json](/help/samples/branded-report/ward-summary.json): one month for six wards.

The sample's shape, so you know what the fields are called:

```The sample: ward-summary.json (shortened)
{
  "site": "Summit Valley Medical Center",
  "period": "October 2026",
  "beds": 160, "occupied": 138, "average_occupancy_pct": 86.2,
  "wards": [
    { "ward": "Ward 4A", "beds": 32, "occupied": 29, "occupancy_pct": 90.6 },
    { "ward": "Ward 4B", "beds": 32, "occupied": 30, "occupancy_pct": 93.8 }
  ]
}
```

## Build it

### Upload the logo

1. Open **See results › Reports** and its **Assets & branding** tab, and choose **Upload asset**.
2. **Kind**: **Logo**. **Name**: `Summit Valley logo`. **File**: `summit-valley-logo.png`.
3. Choose **Upload**. A logo is in use at once; it shows **Approved** on its card.

### Make the brand profile

1. On **Assets & branding** choose **New brand profile**.
2. **Name**: `Summit Valley standard`. **Start from**: the starter. Choose **Create the draft**.
3. Under **Look**: pick the logo under **Logo · optional**, then set **Main colour** `#0F766E`, **Text** `#1E2939`,
   **Background** `#FFFFFF`, **Heading font** and **Body font** `Noto Sans`. The line under the fonts should say the text
   and background pass contrast.
4. Under **Contact and page defaults** fill in:

```Contact and page defaults
Organisation name:   Summit Valley
Contact email:       records@summit-valley.example
Website:             summit-valley.example
Header:              {{report.period}}
Footer:              {{contact.email}} · {{website}}
Confidentiality line: Confidential: synthetic demonstration data · {{report.period}}
```

5. Choose **Save draft**, then **Publish v1** and confirm, then **Make the workspace default**.

![Summit Valley's brand profile with its live preview](rcp-b-brand "The brand profile: logo, colours and fonts on the left, the page as it prints on the right")

### Lay out the template

1. Open the **Templates** tab and choose **New template**. **Name**: `Ward summary`; **Category (optional)**:
   `Operations`. Choose **Create the draft**. The designer opens on an empty page.
2. Above the page, open the test-data chip (it reads **No test data**). In **Test data** choose **Paste JSON**, paste the
   whole of `ward-summary.json`, and choose **Fill the canvas**.
3. While the panel is open, type `October, all wards` beside **Keep as a test sample** and choose it, so the next person
   tests with the same data.
4. Check **Brand:** above the page says **Workspace default · Summit Valley standard**. The logo, header and footer appear.
5. From **Components**, add a **Heading** and set its **Text** to `Ward summary · {{primary.site}}`.
6. Add a **Metric**: **Label** `Average occupancy (%)`, **Data field** `primary.average_occupancy_pct`, **Format**
   `number` with **Decimals** `1`.
7. Add a **Table**: **Title** `Wards`, **Collection** `wards`, and under **Columns** one column for each of `ward`
   (label `Ward`), `beds` (`Beds`), `occupied` (`Occupied`) and `occupancy_pct` (`Occupancy %`). Tick **Striped rows**.
8. Add a **Chart**: **Title** `Occupancy by ward`, **Type** **Bar**, **Collection** `wards`, **Category** `ward`, and
   under **Values** one series named `Occupancy %` of `occupancy_pct` with **Sum** (one row per ward, so the sum is the
   ward's own figure). Tick **Axis starts at zero**.
9. Choose **Validate** at the top. The foot of the designer should say **Template structure valid** and no problems with
   this data.
10. Choose **Publish v1** (or **Ask for approval** if someone else publishes templates in your workspace).

![A template with a chart and a table on the brand's page](rcp-b-designer-chart "Summit Valley's Budget vs actual in the designer: a chart above a table, on the Summit Valley standard brand")

More on each component's settings is in [The designer](#rs-designer) and [Components](#rs-components).

### Generate the report

1. On the template's page choose **Create report**. The new report opens on **Template** with Ward summary picked.
2. **Report name**: `Ward summary · October 2026`.
3. Under **Data source** pick **Test sample** and the sample `October, all wards`. Under **Match template fields**
   every field the template reads shows **Matched**.
4. Choose **Preview and check**. **Checks** should say the data contract, bindings, assets and layout pass.
5. Under **Outputs** keep **PDF** ticked, and choose **Generate v1**, then **Open the report**.

## Check it worked

- **Reports › Library** has **Ward summary · October 2026**, version **v1**, status **Ready**, 1 page.
- The PDF shows the logo top left and `October 2026` top right, the heading *Ward summary · Summit Valley Medical
  Center*, the metric **86.2**, a table of **6** wards (Ward 4A 90.6, Ward 4B 93.8, Ward 5A 78.6, Ward 5B 89.3, ICU 93.8,
  Maternity 70.8) and a bar chart with the same six bars, and the footer
  `records@summit-valley.example · summit-valley.example` with the confidentiality line.
- The template's page lists **Published v1** and the test sample **October, all wards**.

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| The canvas shows field names in brackets, such as `[primary.site]` | No test data is loaded. Open the test-data chip and fill the canvas with the sample. |
| `missing: primary.site` in red on the canvas | The test data has another shape than the template expects. Paste the sample again, or check the paths under **Data**. |
| **Collection** offers nothing | Pick the collection after the test data is loaded: the list comes from the data. |
| The report has no logo | The brand profile is still a draft, or another profile is the default. Publish it and choose **Make the workspace default**, or pick it under **Brand:**. |
| **Publish v1** is not offered | You may not publish templates. Choose **Ask for approval**; a publisher decides it in **Review › Approvals**. |
| The template cannot be generated | Only a published version makes reports. Publish the draft first. |

> **Note:** Not yet verified end to end: Summit Valley has no template with a **Metric** tile. The Metric's settings
> above are the designer's own; check the preview before you publish.
