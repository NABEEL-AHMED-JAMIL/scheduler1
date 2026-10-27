---
id: rcp-ocr
title: "Read scanned pages: Split pages, Read text from pages, and a person's check"
summary: A faxed PDF dropped in the inbox is split into pages, the scanned ones read by OCR, the pages it is unsure of checked by a person; or the same file read into a document's fields.
section: Building blocks
who: A workspace administrator builds it; the team named for the check reads the unsure pages
where: Get data in › Documents › Intake (/documents/intake/file-drop); Build › Pipelines (/pipelines/list); Run & review › Review (/review/all)
related: step-ai, doc-intake, doc-reading, doc-review, trg-file, run-items, rcp-journey-referral, rcp-ai-prompt
popular: Read text from scanned pages
---
A fax or a scan is a picture of a page: it has no text a pipeline can read. Two steps turn it into text. **Split
pages** makes one row per page, with the text a page already has and an image of it. **Read text from pages** reads the
image of each page that has no text of its own with the platform's OCR, says how sure it is, and sends a page it is
not sure enough of to a person, with the image beside the text.

## What you'll build

- The pipeline **Faxed referrals: split pages and read them**, started when a file named `fax-referral-*.pdf` arrives
  in the inbox. It keeps one line per page (its text, how sure the reading was, and its status) as a JSON Lines file.
- The check: a page read with less than 85 % sureness is marked **Check by hand** for the HIM team.
- Another way: the same fax uploaded to **Documents**, where it is read into a **Referral**'s fields and reviewed in
  **Review › Documents**.

![The fax pipeline's steps](rcp-ai-ocr-steps "Faxed referrals: the arriving PDF, split into page images, the scanned pages read, kept as JSON Lines")

## What you need first

- A storage connection that is the workspace's inbox, and **File drop** in your page access
  ([The file drop](#doc-file-drop)).
- A team for the checks, such as **HIM**.
- [fax-referral-SV-000131.pdf](/help/samples/ocr-document-intake/fax-referral-SV-000131.pdf): three synthetic pages. Page 1 is a
  typed cover sheet with its own text; pages 2 and 3 are scans with no text, page 3 in handwriting.

## Build it

### The pipeline

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Faxed referrals: split pages and read them`,
   **Create and add steps**. **Data sensitivity**: **Sensitive**.
2. Add the four steps below and **Save**.
3. **Schedule**: **Only when started**; under **Also starts when**, tick **A file arrives**, **Which files**
   `fax-referral-*.pdf`, **Files per run** `1`. **Create schedule**.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `file` | **Prefix** `intake/`, **Read as** list, **The run's own files first** on |
| 2 | Split pages | `pages` | **Bucket** your inbox bucket, **File key column** `key`, **Image resolution (dpi)** 150, **A page needs at least characters** 20, **At most pages a document** 30 |
| 3 | Read text from pages | `ocr` | **Pages from** `pages`; **Which pages** `no_text_layer`; **Flag a page when sureness is below (%)** 85; **Who checks the pages** the HIM team (a role, or a team's id; empty: the workspace's administrators) |
| 4 | Save File | `keep` | **File name** `pages.jsonl`, **Format** jsonl |

> **Tip:** `no_text_layer` reads only the pages without text of their own, so a typed page keeps its text and is not
> read or billed again. Choose `every_page` for an audit copy in which every page is read the same way.

### Drop the fax

1. Open **Get data in › Documents › Intake › File drop**.
2. Drop `fax-referral-SV-000131.pdf` on **Drop files here**. It shows **Uploaded**, and the schedule starts a run.

### Another way: read it into a document's fields

1. Add the **Referral** type from **Add from starters** on **Documents › Document types**, if you have not.
2. On **Documents › Intake › Upload**, choose **Upload documents**, add the same PDF, and choose **Upload**.
3. The console reads its pages (the scans by OCR), matches it to **Referral** and reads the fields; the values it is
   unsure of send it to **Review › Documents** ([Review a document](#doc-review)).

## Check it worked

1. **Run & review › Runs** shows the run, **Started by** *A trigger*, 4 of 4 steps completed.
2. Its **Items** tab has one item, the PDF, with three sub-items: **Show the pages of** it lists pages 1 to 3.
3. Page 1 keeps its own text (`ocr_source` `text-layer`); pages 2 and 3 are read by OCR (`ocr_source` `ocr`), each with
   `ocr_sureness` from 0 to 100.
4. The handwritten page 3 is likely below 85 %: it is **Check by hand**, the Items view's filter of that name lists it,
   and the HIM team sees it with its image beside the text.
5. `pages.jsonl` in the run's **Outputs** has three lines, one per page.
6. Uploaded to **Documents** instead, the fax is a **Referral** for Tomas Holloway (`SV-000131`), waiting in **Review ›
   Documents** for any value it was unsure of.

> **Note:** Not yet verified end to end in Summit Valley: its fax pipeline is built and has not run yet. The sureness
> of a handwritten page depends on the scan, so page 3 may also pass.

## Common mistakes

- **Every page is "failed" after Split pages.** A scanned page has no text, so with **A page needs at least
  characters** above 0 it fails that step by design: **Read text from pages** reads it next. Set it to 0 only when no
  page needs OCR.
- **Nothing is read.** **Pages from** must name the **Split pages** step's key (`pages`); the image column is
  `page_image` unless you changed it.
- **The run reads an old fax.** Turn on **The run's own files first** in **Read S3**, so an arrival's run reads just
  that file.
- **The file does not start the run.** The name must match `fax-referral-*.pdf`, and the schedule must be **Active**.
- **The bill is higher than expected.** Every page read by OCR is billed (OCR pages); `every_page` reads them all.
- **The fax is upside down.** OCR turns a page to read it upright and says how far in `ocr_rotation`; check the result
  by hand anyway.

> **Privacy:** A fax often carries more than the referral (a cover sheet, other patients' pages sent by mistake). Keep
> the pipeline **Sensitive** and let a person check before the text goes anywhere.
