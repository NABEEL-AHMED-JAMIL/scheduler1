---
id: rs-designer
title: Lay out a template in the designer
summary: Components, layers and data fields; page settings, watermark, letterhead; undo, autosave and checks.
section: Design
who: Anyone with Report templates (editing a draft); publishing needs Publish report templates
where: Reports › Templates (/reports/templates)
related: rs-components, rs-ai-designer, rs-data, rs-branding
popular: Lay out a report template
---
The designer is where a template's draft is laid out: the components on the left, the page in the middle, the settings
of what you selected on the right. It draws the page as the PDF will print it, filled with your test data as you go.

![The designer](rs-designer "The designer: Components, Layers and Data on the left, the page with its ruler, Page settings on the right")

## Open it
1. In **Reports › Templates**, choose **Edit draft** on a template, or **New draft from vN** on a published one (a
   published version is never edited: your changes go into a new draft).
2. The header shows the template's name, **Draft vN** or **Published vN**, and whether your changes are saved
   (**Saving…**, **All changes saved**, **Unsaved changes**). The draft saves itself as you work.
3. **Preview** draws the whole report as a PDF with the test data; **Validate** runs the checks.

## Add and arrange components
1. On the **Components** tab, drag a component onto the page, or click it to add it after the selected block. **Find a
   component** searches the list. The groups are **Text**, **Data**, **Metadata**, **Layout**, **Media** and
   **Approval**; [Components](#rs-components) describes each one.
2. **Page parts** adds a **Header** or **Footer** (printed on every page) and a **Page break**. **Pages** lists the
   pages, with their first heading; click one to jump to it.
3. Click a block on the page to select it. Its settings open on the right, grouped as content, data, format, style and
   layout. A selected block has a handle: drag it to move the block.
4. The **Layers** tab shows every block as a tree. Drag to reorder; the arrow keys select the block above or below, and
   **Alt** + an arrow moves it.
5. **Undo** (Ctrl+Z) and **Redo** (Ctrl+Y) are in the toolbar, beside the zoom (50 % to 200 %), **Fit** and full screen.

## Bind data
A component shows data through a **binding**: a path into the report's data, such as `primary.patient.name` or a list
such as `primary.labs`. The **Data** tab lists the test data's fields with their types: click one to use it in the
selected block. A field that holds pictures shows **Show as image**, which adds an **Image from data** (or an **Image
grid** for a list).

> **Tip:** Add test data first ([Data and test samples](#rs-data)). The page then fills with real-looking values and the
> checks tell you about a binding that reads nothing.

## Page settings
Click **Page settings** in the toolbar (or click outside every block) to set the whole report:

- **Page**: **Size** (A4, A3, A5, Letter, Legal), **Orientation**, and the four margins in millimetres (16 by default).
- **Type and colour**: **Font** (Noto Sans, Noto Serif, Noto Sans Mono, DejaVu Sans), **Text size** (9 to 12 pt) and the
  **Main colour**.
- **Watermark**: **DRAFT**, **COPY**, **CONFIDENTIAL**, **VOID**, **SAMPLE** or **Own words…** (up to 40 characters), its
  strength, angle, pages, layer and colour, and **Only when** a condition holds (for example `isReprint = true`).
- **Page background**: a soft **Tint** on every page or the first, and a **Letterhead** from your approved assets.
- **Every download after the first says COPY**.
- **Brand** (in the toolbar): the workspace default, a brand profile, or **No branding**.

> **Note:** Previews always say DRAFT across the page, so a preview is never mistaken for the real report.

## Checks and publishing
The bar at the bottom reads **Template structure valid** (or **Template has errors**), how many problems the bindings
have with the test data, and how many data fields the template uses. Click it to see the **Checks**. A draft with
structure errors cannot be published. When it is right, choose **Publish vN**, or **Ask for approval** if someone else
publishes ([Templates and the library](#rs-templates--publish)).

If someone else saved the same draft while you had it open, the designer says so and offers **Reload** or **Save as a
copy**: nothing of yours is lost.

## Example
Summit Valley's **Patient health chart** has a heading bound to the patient's name, a row of **Metric** tiles (records,
lab results, vital readings), a **Chart** of SpO2 and heart rate, a **Table** of labs, an **Image grid** of imaging and
wound photos, and sections for medicines and the care plan, on Letter pages in the Summit Valley standard brand.
