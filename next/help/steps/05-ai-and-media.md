---
id: step-ai
title: "AI and media steps: prompts, recordings, files, pages and images"
summary: AI prompt, Transcribe audio, Convert file, Split pages, Read text from pages, Measure image and Measure mask.
section: AI, media and people
who: A workspace administrator adds steps; the models a step may use follow the workspace's data policy
where: Build › Pipelines › a pipeline › Steps › Add step (/pipelines/list)
related: step-check, step-people, step-outputs, pl-settings, step-glance, ai-steps, ai-prompts
popular: Ask an AI model about each row
---
These steps work on what is not yet a row of data: a recording, a document, a scanned page, a photo, or a question for a
model. Most of them work one file or one row at a time, so a run's **Items** view shows each file with how it went.

Several of them read files in the same way. **Bucket** names the storage connection the files are in, and **File key
column** names the column that holds each row's file key. Leave both empty to work on the list a **Read S3** step made
before it, or on the files the run was started for (a file that arrived in the inbox).

> **Warning:** A model's answer is a DRAFT for a person to check. Put an [Approval](#step-people) step, or the
> pipeline's review, after an AI step whose answer matters.

![The AI prompt step's settings](step-ai "AI prompt: a saved vision prompt run on each wound photo, its answer split into fields")

## AI prompt

**What it does.** Runs one of the workspace's saved prompts on each row, optionally with the row's image, and adds the
answer as columns.

**Settings.**

- **Prompt** (required): a saved prompt of this workspace. Its model connection runs it.
- **Variables**: the prompt's variables by name, filled from the row (`{{record_id}}`). A variable not named here is
  filled from the row's column of its name; a required one with no value fails that row.
- **Image**: a **Bucket** and an **Image key column** to send each row's image (png, jpg, webp or gif) to a vision
  model with the prompt.
- **Answer column** (`ai_output`), and **Fields**: each **From the answer at** a dot path into a JSON answer (`status`,
  `result.score`) **As column**.
- **When a row fails**: `fail` the step, `skip` the row, or `null` (keep it with the answer empty).
- **Calls at once** (1, at most 8) and **At most rows** (50).

**Example.** **Journey 7 · Wound photo** sends each photo to the vision prompt "Wound description (DRAFT)" and keeps the
stage, tissue and exudate as columns for the wound-care nurse to approve.

**Limits.** At most 500 rows a step; an image at most 8 MB. Time limit 3,600 seconds. Which models may see the data is
set by the workspace's data policy for the pipeline's sensitivity.

## Transcribe audio

**What it does.** Turns each row's recording (mp3, m4a, wav, ogg, flac or webm) into text with the platform's
transcriber.

**Settings.** **Bucket**, **File key column**, **Timestamps** (off; on also adds `segments`: each stretch of speech with
its start and end, as JSON), **When a file fails** (`fail`, `skip`, or `null`: kept with the transcript empty and the
reason in `transcribe_error`), **Calls at once** (1), **At most files** (20).

**Adds.** `file_name`, `file_stem`, `transcript`, `language`, `duration_seconds` and, with timestamps, `segments`.

**Example.** **Care-call insight, one report per call** transcribes each home-health call recording two at a time,
then asks a prompt for the call's summary, symptoms and actions.

**Limits.** A recording up to 500 MB; at most 1,000 files a step. Time limit two hours.

## Convert file

**What it does.** Converts each row's file with the platform's converter and writes the result to a bucket or keeps it
with the run.

**Settings.**

- **Bucket**, **File key column**.
- **Convert to** (`pdf`): a document to pdf, txt, docx, odt, rtf, md or html; a spreadsheet to pdf, csv, xlsx or ods; a
  presentation to pdf or pptx; images to png or jpg.
- **Write the result to**: `bucket` (an object at **Output key** in **Output bucket**; empty: the file's own bucket) or
  `run` (a file kept with the run, in its outputs).
- **Output key** (`converted/{{file_stem}}.{{format}}`), **When a file fails** (`fail`, `skip` or `null`), **At most
  files** (20).

**Adds.** `converted_key`, `converted_pages`, `converted_bytes` and `convert_status`.

**Example.** **Letters archived as PDF** converts each night's new letters to PDF under `archive/`, skipping a corrupt
file and carrying on.

**Limits.** A file up to 500 MB; at most 1,000 files. Time limit 3,600 seconds.

## Split pages

**What it does.** Splits each row's PDF into pages: one row per page with its text, each page's image kept with the
run. Every page becomes a sub-item of its document, with its own status and retry.

**Settings.** **Bucket**, **File key column**, **Image resolution (dpi)** (100, from 72 to 200), **A page needs at least
characters** (1; a page with less text failed, as a scanned page needs OCR; 0: never), **When a page or file fails**
(`null` unless you say), **At most documents** (20) and **At most pages a document** (200).

**Adds.** `page`, `page_count`, `page_text`, `page_chars`, `page_image`, `page_status`, `page_error`.

**Limits.** A PDF up to 200 MB; at most 100 documents and 2,000 pages a document. Time limit 3,600 seconds.

## Read text from pages

**What it does.** Reads the text on page images that **Split pages** made, with the platform's own OCR, and says how
sure it is. A page it is not sure enough of is marked **Check by hand** and sent to **Review** with its image beside
the text.

**Settings.**

- **Pages from** (required): the earlier step whose page images are read, usually **Split pages**.
- **Image column** (`page_image`), **Text layer column** (`page_text`), **Language** (`eng`, English).
- **Which pages**: `no_text_layer` (only scans and photos; pages with their own text keep it and are not read or billed)
  or `every_page`.
- **A text layer has at least (characters)** (16): a page with fewer characters has no text layer and is read.
- **Flag a page when sureness is below (%)** (80, from 50 to 99), and **Who checks the pages** (a role or a team; empty:
  the workspace's administrators).
- **When a page cannot be read** (`null`), **At most pages** (200).

**Adds.** `ocr_text`, `ocr_sureness` (0 to 100), `ocr_source` (`ocr` or `text-layer`), `ocr_words`, `ocr_status` (`ok`,
`check` or `failed`), `ocr_note` and `ocr_rotation` (how far the page was turned to be read upright).

**Example.** **Faxed referrals: split pages and read them** splits each fax, reads only the scanned pages, and sends the
handwritten page the OCR is unsure of to the records team.

**Limits.** At most 2,000 pages. Each page read is billed (OCR pages). Time limit two hours.

## Measure image

**What it does.** Measures the object in each row's photo against the ruler in it (1 cm ticks), in code, not by a
model: length, width and area in cm.

**Settings.** **Image** (required): a **Bucket** and an **Image key column** (png or jpg). **What to measure**:
`contrast` (the largest region outside the ruler whose colour differs markedly from the background) or `red_region` (a
red region on a lighter background, leaving out a lighter, pinker halo). The output column names (`scale_found`,
`px_per_cm`, `length_cm`, `width_cm`, `area_cm2`, `measure_note`), **When a photo cannot be read** (`null`: sizes empty
and the reason in the note), **At most rows** (50).

**Example.** Wound photos taken with a paper ruler beside the wound: the step gives the size, and the change since the
last visit is worked out by **Compute**.

**Limits.** At most 500 rows.

## Measure mask

**What it does.** Measures the region a segmentation mask marks (the marked pixels light on a dark background), in
pixels: area, share of the image, bounding box and region count. A mask has no scale, so no cm or mm.

**Settings.** **Mask** (required): a **Bucket** and a **Mask key column**. **Marked from brightness** (128, from 1 to
255), **Column prefix** (such as `lesion_`), **When a mask cannot be read** (`null`), **At most rows** (50).

**Adds.** `mask_width`, `mask_height`, `area_px`, `area_pct`, `box_x`, `box_y`, `box_width`, `box_height`, `regions`,
`largest_region_px` and `measure_note`.

**Example.** **Breast ultrasound: lesion size from the mask** measures each frame's lesion mask, with the prefix
`lesion_`.

**Limits.** At most 500 rows.
