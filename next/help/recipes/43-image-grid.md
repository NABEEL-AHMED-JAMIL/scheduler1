---
id: rcp-image-grid
title: An image grid report of wound photos
summary: Put six synthetic wound photos in a bucket and make a report that lays them out three to a row, each with its caption, beside a table of the measurements.
section: Healthcare
who: Anyone who may make templates and generate reports, and who can open the bucket the photos are in
where: See results › Analysis › Files (/data/files); Reports › Templates (/reports/templates); Reports › Library (/reports/library)
related: rs-components, rs-data, rcp-branded-report, rcp-signed-report, rcp-wound-photo-check
popular: Show photos in a report
---
An **Image grid** prints one picture for each item of a list in the data, a fixed number to a row, with a caption under
each; a row of pictures never splits across two pages. The pictures are read from your own storage by their keys when
the report is made, as the person making it, and scaled to the size they print at. Here the list is a wound clinic's
photo visits; the same block shows X-rays, site photos or scanned receipts.

## What you'll build

- Six photos in the folder `wound/photos/` of your bucket.
- A template, **Wound photo review**, with a table of the visits (MRN, visit, date, length, width, area) and an
  **Image grid** of the photos, **3** to a row, each captioned with the patient, the visit, the date and the area.
- One report made from the sample: a page with the table and **2** rows of **3** photos.

Summit Valley's *Patient health chart* has the same block, *Imaging and wound photos*, three to a row at 40 mm; the
figure shows its settings.

## What you need first

- A storage connection, and permission to open it in **Files** (the report reads the photos as you).
- The sample files, all synthetic test images drawn in code and marked SYNTHETIC on the picture, each with a 10 cm
  ruler:
  - [wound-SV-000117-v1.jpg](/help/samples/image-grid/wound-SV-000117-v1.jpg),
    [v2](/help/samples/image-grid/wound-SV-000117-v2.jpg), [v3](/help/samples/image-grid/wound-SV-000117-v3.jpg)
  - [wound-SV-000148-v1.jpg](/help/samples/image-grid/wound-SV-000148-v1.jpg),
    [v2](/help/samples/image-grid/wound-SV-000148-v2.jpg)
  - [wound-SV-000169-v1.jpg](/help/samples/image-grid/wound-SV-000169-v1.jpg)
  - [wound-review.json](/help/samples/image-grid/wound-review.json): the six visits, each with `photo_key` (where the
    photo is) and `caption`.

Each visit in the sample looks like this:

```One visit in wound-review.json
{ "mrn": "SV-000117", "site": "left foot, plantar", "visit": 1, "visit_date": "2026-10-19",
  "length_cm": 4.2, "width_cm": 2.8, "area_cm2": 9.24,
  "photo_key": "wound/photos/wound-SV-000117-v1.jpg",
  "caption": "SV-000117 · visit 1 · 2026-10-19 · 9.24 cm²" }
```

## Build it

### Put the photos in the bucket

1. Open **See results › Analysis › Files** and choose your storage connection.
2. Make the folder `wound` and inside it `photos` (**New folder**), open `photos` and **Upload** the six `.jpg` files.
3. Each file's **Details** shows its path, for example `wound/photos/wound-SV-000117-v1.jpg`: exactly the `photo_key`
   in the sample.

### The template

1. **Reports › Templates** → **New template**: **Name** `Wound photo review`, **Category (optional)** `Clinical
   documents`, **Create the draft**.
2. Fill the canvas with `wound-review.json` (**Paste JSON**) and keep it as the test sample `Six visits`.
3. Add a **Heading**: `{{primary.title}} · {{primary.period}}`, and a **Text**: `{{primary.clinic}}. Measured against
   the ruler in each photo; synthetic test images.`
4. Add a **Table**: **Title** `Visits`, **Collection** `photos`, columns `mrn` (`MRN`), `visit` (`Visit`),
   `visit_date` (`Date`), `length_cm` (`Length (cm)`), `width_cm` (`Width (cm)`), `area_cm2` (`Area (cm²)`).
5. Add an **Image grid** and set:

| Setting | Value |
|---|---|
| **Title** | `Wound photos` |
| **Collection** (under **Data**) | `photos` |
| **Picture field** | `photo_key` |
| **Caption field** | `caption` |
| **Pictures from** | **A bucket (the field is a key)**, and your storage alias in the box beside it; leave **Folder before the key (optional)** empty, because `photo_key` already holds the folder |
| **Pictures a row** | `3` |
| **Picture height** | `40mm` |
| **When the image is missing** | `placeholder` |
| **At most pictures** | `12` |

6. The canvas now shows the six photos. **Validate**, then **Publish v1**.

![The Image grid's settings](rcp-b-grid-design "Summit Valley's Patient health chart, its Image grid selected: picture field image_key, caption field finding, pictures from the bucket, 40 mm high")

### Generate

1. **Create report** on the template's page, **Report name** `Wound photo review · 19 to 23 October 2026`.
2. Data: **Test sample** `Six visits`. **Preview and check**: the checks pass, and the preview shows the photos.
3. **Generate v1** and **Open the report**.

## Check it worked

- The Library has **Wound photo review · 19 to 23 October 2026**, **v1**, **Ready**.
- The PDF has the table with **6** rows (areas 9.24, 6.5, 4.1, 4.87, 3.6 and 12.57 cm²), then **Wound photos**: **2**
  rows of **3** photos, each 40 mm high, captioned like *SV-000117 · visit 1 · 2026-10-19 · 9.24 cm²*.
- Every photo shows its ruler and the SYNTHETIC banner; none shows the placeholder.
- SV-000117's three photos get smaller visit by visit, as the table's areas do.

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| Grey placeholders instead of photos | A key does not match a file. Compare `photo_key` with the file's path under **Details**, letter for letter (case counts). |
| Every photo is missing, though the keys are right | **Pictures from** names another bucket, or you may not open this bucket in **Files**: the photos are read as you. |
| Photos missing only when a pipeline makes the report | The pipeline's rows give a different field name; set **Picture field** to the column the rows have. |
| The folder printed twice in the key | **Folder before the key** is filled in and `photo_key` also starts with the folder. Use one of them. |
| A row of photos moved to the next page | By design: a row of pictures never splits. Lower **Picture height** to fit more on a page. |
| A web address in `photo_key` does nothing | Pictures come from your storage (or a run's files), never from a web address. |

> **Privacy:** Real wound photos are health data. Keep them in a storage connection only the care team can open, and
> check who can see the reports in the report's **Access** tab.

> **Note:** Not yet verified end to end: this exact template was not generated in Summit Valley. Its Image grid
> settings are those of Summit Valley's *Patient health chart*, whose report (4 pages) was made and signed.
