---
id: rcp-wound-photo-check
title: Measure wound photos, and retry the one that failed
summary: Measure wounds against the ruler in each photo, in code; see a photo with no visible ruler measured as nothing, and an unreadable file fail and be retried on its own.
section: Healthcare
who: A workspace administrator builds it; anyone who may open the schedule retries its items
where: Build › Pipelines (/pipelines/list); Run & review › Runs (/runs/latest)
related: step-ai, run-items, run-failures, step-read, dash-files
popular: Retry only the failed photos
---
Nurses photograph wounds with a paper ruler beside them. The **Measure image** step finds the ruler's 1 cm ticks and
measures the wound in centimetres, in code, not by a model, so the same photo always gives the same size. This recipe
measures four photos: two good ones, one taken so dark that no ruler can be seen, and one file that is not a picture at
all. The bad file makes the run fail; you replace it and retry only the failed items.

> **Note:** The photos are synthetic drawings marked SYNTHETIC TEST IMAGE, not patients. A measurement is for a person
> to check against the photo.

## What you'll build

A pipeline **Wound photos too dark to measure** of three steps: list the photos in a folder, measure each one, keep the
measurements as `wound-check.csv`. Each photo is an **item** of the run, so the run's **Items** tab shows which one
failed and lets you retry it alone.

![The run's items after the retry](rcp-x-wound-items "Summit Valley's run after Retry failed items: four photos, each Done")

## What you need first

1. **A storage connection**, *your bucket* (see [Connect your storage](#con-storage)).
2. **The four sample photos**:
   - [wound-photo-SV-000148.jpg](/help/samples/wound-photo-check/wound-photo-SV-000148.jpg): a wound drawn 3.1 × 2.0 cm.
   - [wound-photo-SV-000169.jpg](/help/samples/wound-photo-check/wound-photo-SV-000169.jpg): a wound drawn 5.0 × 3.2 cm.
   - [wound-photo-dark.jpg](/help/samples/wound-photo-check/wound-photo-dark.jpg): the second photo, far too dark.
   - [wound-photo-unreadable.jpg](/help/samples/wound-photo-check/wound-photo-unreadable.jpg): text with a `.jpg`
     name, not a picture.
3. **The replacement** [wound-photo-unreadable.jpg (good)](/help/samples/wound-photo-check/replacement/wound-photo-unreadable.jpg),
   a real photo with the same name, for the retry. Keep it in another folder on your computer.
4. **Put the four photos in your bucket** under a folder `wound/check/` (**See results › Analysis › Files**, **New
   folder**, **Upload**; see [Files](#dash-files)). Not the replacement yet.

## Build it

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Wound photos too dark to measure`, **Create
   and add steps**.
2. Add the steps:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `photos` | **Bucket** your bucket; **Prefix** `wound/check/`; **Read as** `list` |
| 2 | Measure image | `measure` | **Image**: **Bucket** your bucket, **Image key column** `key`; **What to measure** `red_region`; **When a photo cannot be read** `fail` |
| 3 | Save File | `keep` | **File name** `wound-check.csv`; **Format** `csv` |

3. On the **Settings** tab, set **Data sensitivity** to **Sensitive**: wound photos are patient data.
4. **Validate**, **Save**, then **Run now**.

> **Tip:** `red_region` measures a red region on lighter skin and leaves out the pinker halo around it, which suits wound
> photos. `contrast` measures the largest region that differs from the background, which can be a dark band or a
> shadow; Summit Valley's check uses it and one of its photos came out 14.3 × 0.6 cm, "touches the photo's edge". Read
> the **Note** column before you trust a size.

### When it fails: replace the file and retry the items

1. The first run **Fails** at **Measure image**: "Row 4: The file is not a png or jpg image." On its **Items** tab all
   four photos read *Failed at* the measure step, because the step stopped as a whole.
2. In **See results › Analysis › Files**, open `wound/check/`, **Delete** `wound-photo-unreadable.jpg`, and **Upload**
   the replacement of the same name.
3. Back on the run's **Items** tab, choose **Retry failed items (4)** (see [Retry only the failed items](#run-failures--retry-only-the-failed-items)).
   The list step is reused, not run again; only the measuring is done again.

## Check it worked

After the retry the run is **Completed**, its attempt number 2, and its **Items** tab reads 4 items, 4 done, 0 failed.
`wound-check.csv` on the **Outputs** tab has four rows:

| Photo | `scale_found` | Length × width | Note |
|---|---|---|---|
| wound-photo-SV-000148.jpg | true | about 3.1 × 2.0 cm | ruler 11 ticks, 70.0 px/cm |
| wound-photo-SV-000169.jpg | true | about 5.0 × 3.2 cm | ruler 11 ticks, 70.0 px/cm |
| wound-photo-dark.jpg | false | empty | no ruler found: not measured |
| wound-photo-unreadable.jpg | true | about 3.1 × 2.0 cm (the replacement) | ruler 11 ticks, 70.0 px/cm |

The dark photo is not an error: with no ruler in sight there is nothing to measure against, so its sizes are empty and
the note says why. Ask for the photo to be taken again.

> **Note:** Not yet verified end to end with `red_region` on these four photos. Summit Valley's run of this recipe used
> `contrast` (attempt 1 failed on the unreadable file, attempt 2 completed after the retry); `red_region` measured
> Summit Valley's journey wound photo at 4.3 × 2.9 cm for a wound drawn 4.2 × 2.8 cm.

## Common mistakes

- **Read S3 lists nothing.** The **Prefix** is a folder inside the bucket and ends with `/`: `wound/check/`.
- **Measure image fails at once on every row.** **Image key column** must be `key`, the column **Read S3** writes for
  each object. Leave **Bucket** the same as the read step's.
- **The retry fails again.** The replacement must have exactly the same name, in the same folder, as the file that
  failed. Retrying reads the file again from your bucket.
- **You want the run to go on past a bad file.** Set **When a photo cannot be read** to `null`: the file's sizes are
  empty and its note says why, and the run completes. Use `fail`, as here, when a person must see every bad file.
