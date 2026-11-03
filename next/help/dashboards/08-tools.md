---
id: dash-tools
title: Tools: Document Converter, Audio Transcript and Image review
summary: Convert several documents at once and check each result beside its original, turn recordings into timed text you can play back, search and use, and describe, measure, sort and route clinical images (wounds, skin lesions, burns, X-rays, tissue slides) without ever diagnosing.
section: Files and tools
who: Anyone whose page access includes Document Converter, Audio Transcript or Image review
where: See results › Tools › Document Converter (/tools/converter); See results › Tools › Audio Transcript (/tools/transcript); See results › Tools › Image review (/tools/images)
related: dash-files, bill-usage
---
The tools do by hand what a pipeline's steps do for many files: the **Document Converter** converts documents,
**Audio Transcript** turns recordings into text, and **Image review** describes and measures clinical images, the same way a scheduled run
does it. Each keeps what it made, so nothing is lost when you leave the page, and each is billed like the steps it stands
in for.

The pages work like the Report library: **facets** on the left with their counts (tick one or more to narrow the list),
one **search**, a window of **7 days**, **30 days**, **90 days** or **All time**, and the list itself. Choosing a row opens
its **side panel** on the right; **×** closes it. Under 1180 px the facets sit behind **Filters** and the panel lies over
the list.

## Convert documents
1. Open **See results › Tools › Document Converter**. The page is the conversion history.
2. Drop up to 20 files anywhere on the page (50 MB each), or use **Convert files** or **Choose files…** in the strip
   above the list, or **From a bucket**. They convert at once, two at a time, to the format in the strip's **to** (PDF
   unless you pick another; a PDF dropped "to PDF" becomes a Word file).
3. Each file appears at the top of the list with its progress (**Converting 70%**), then as **Done**. A file the
   converter does not read (a recording, an archive) is marked **Not supported**; choose it to see why and where to go
   instead. If the converter is busy a file shows **Converter busy** and is sent again by itself.

The list shows each file with its type and size, the conversion (`DOCX → PDF`), the result (`3 pages · 212 KB`), its
status, who converted it and when. Narrow it with **Status** (Done, Converting, Shortened, Failed), **From** (Word, Excel
and CSV, PowerPoint, PDF, Images, Markdown and HTML), **Kept** (In a bucket or Documents, 30 days only) and **Made by**
(Me, Others), or search a file name or format. A result not kept stays 30 days, then is removed.

A failure is said in plain words with what to do next: **Too large to convert** names the limit and suggests splitting
the file; **Protected with a password** says how to remove the password and drop the file again.

![Document Converter](dash-converter "Document Converter: facets, the drop strip and the history, with a conversion open in the side panel")

## Check a result and use it
Choose a conversion. The side panel shows its status and `DOCX → PDF · 3.1 s`, then three tabs:

- **Result**: the converted file page by page (**Page 1 of 3**), with the converter's checks on one line (the pages as in
  the original, the fonts embedded; a font that was replaced, for example Calibri by Carlito, is said apart);
- **Original**: the file you dropped, page by page;
- **Details**: both files, sizes and pages, how long it took, who converted it, how long it is kept, and every check.

**Next steps**: **Download** the result; **Send to Documents** reads a PDF or an image as a document type (for example a
discharge summary) and puts it in the review queue (offered to people who can open Documents); **Start a pipeline** keeps
the result in a bucket first if it is not, then opens the AI Assistant with the file named; under **⋮**, **Keep in a
bucket…** saves it to a folder you choose, and **Delete** removes it now. The line underneath says until when it is kept,
or the bucket folder it is in. **Supported formats** (top right) opens a side sheet with each family's formats and a
search (type `.vsdx`).

> **Note:** A PDF made from a dataset or from a run is a report, not a file conversion: make it from
> **Reports › From pipelines** with **PDF from a dataset or a run**.

## Turn a recording into text
1. Open **See results › Tools › Audio Transcript** and choose **Transcribe recordings**, or drop recordings anywhere on
   the page. The new transcript opens over the list.
2. Add one or more recordings (.mp3, .m4a, .wav or .ogg), or pick one **From a bucket…**. The length of each is read from
   the file before it is uploaded. A file that is not a recording is said at the top, with the Document Converter.
3. Give it a **Name**. **Language** is detected in each part of the recording. **Speakers**: **Detect speakers (2–6)**,
   **One speaker** for a dictation, or **Exactly 2** to **6** when you know how many talk (where speaker labels are
   installed; otherwise the panel says so and the transcript is one stream of text).
4. Choose whether to **Keep the recording 30 days for playback**, **Mask personal details in exports**, and **Send to
   Documents as a visit note when done**.
5. The panel says about how long it takes and how many audio minutes are billed. Choose **Transcribe**.

The recording is transcribed on the server. It appears in the list with its progress (**46%**), and its side panel shows
the stages (**Uploaded**, **Speech found**, **Transcribing**, **Ready**), how much has been heard and the time left. You
can leave the page; it keeps going. **Stop** stops it, and nothing is billed.

![New transcript](dash-transcript-new "Audio Transcript: Transcribe recordings, over the list")

## Find a recording
The list shows each recording's name and file, its length, its speakers as coloured dots, its status, who made it and
when. Narrow it with **Status** (Done, Transcribing, Failed), **Made by** (Me, Others), **Speakers** (One, Two, Three to
six) and **Language** (English, Spanish, …), or **Search names and what was said**.

Choose a recording: the side panel shows `18:42 · English · 3 speakers`, a compact player with one track coloured by
speaker, the first lines of the transcript (choose a time to play from there), its **Speakers** and **Details**, and
**Next steps**: **Open transcript**, **Download**, **Send to Documents**, and under **⋮** **Start a pipeline…**, **Copy
text**, **Transcribe again…** and **Delete recording**.

![Audio Transcript](dash-transcript "Audio Transcript: facets and the recordings, with one open in the side panel")

## A transcript's own page
**Open transcript** opens the recording's page (`/tools/transcript?id=…`, a link you can keep and share with people of
your workspace). The breadcrumb leads back to the list. Under the name and its status: the length, language, speakers,
when and by whom it was transcribed, and the file. **Download** gives text with times, a printable PDF, subtitles (.vtt or
.srt) or JSON; **Send to Documents** sends it as a visit note.

- **Transcript**: one player row stays at the top as you scroll: play and pause, the time, one track coloured by speaker
  with the search's matches marked above it (choose a place on it to go there), and the speed (0.75× to 2×). The table
  below has **Time** (choose it to play from there), **Speaker** and **What was said**; the row being played is
  highlighted, and with **Follow playback** on it is kept in view. **Space** plays and pauses, **J** and **L** go back
  and forward 5 seconds, **/** jumps to the search.
- **Search what was said** shows `3 of 7` with next and previous; the current match is marked stronger, and long
  stretches without a match fold into one line (`32 segments · 00:41 – 05:44 show`).
- **All speakers** shows one speaker's words, whether there are two speakers or six.
- **Speakers**: name each speaker once ("Speaker 1" → "Alex Morgan, RN") and every export uses the name; each one's talk
  time; merge two speakers who are one person.
- **Details**: the file, length, language, model, how long it took, the audio minutes billed, who made it, how long the
  recording and the transcript are kept, and **Mask in exports**: the names, dates of birth and phone numbers heard are
  then replaced with [NAME], [DOB] and [PHONE] in every download.
- Under **⋮**: **Correct text** (corrections are kept as a new version and the original stays), **Show as plain text**,
  **Copy text**, masking, **Keep in a bucket…**, **Start a pipeline…**, **Transcribe again…** with another number of
  speakers (corrections and names go with the old transcript; the new one is billed once), **Delete recording**, and the
  keyboard keys.

![A transcript's page](dash-transcript-page "A transcript's own page: the player row, a search with its matches, and the table of what was said")

### When a recording cannot be transcribed
Each failure says why and what to do next: **too long** (up to 30 minutes; **Split at 30 min** makes parts that are
transcribed one by one), **no speech heard** (**Choose another**), **the transcriber is busy** (it is queued and starts
by itself), and **not a recording** (a Word file goes to the Document Converter).

## Measure a wound photo
**Image review** describes, measures, sorts and routes clinical images: wound photos, skin lesions, burns, X-rays, tissue
slides and other photos. A measured type is measured against the paper ruler in the photo, in code; every image gets a
draft description for a clinician to confirm. It never diagnoses.

1. Open **See results › Tools › Image review**. Drop images anywhere on the page (JPG, PNG or HEIC, up to 20 at once, 25 MB
   each), or use **Upload images**, **Choose images…**, **From a bucket** or **From Documents**.
2. Choose the **Type** of the images (Wound, Skin lesion, Burn, X-ray, Tissue slide, Other photo, or your workspace's own),
   in the strip or for each image, or leave **Choose, or let AI suggest**: a local model then suggests one at upload. A
   suggestion is a draft ("Looks like an X-ray", marked **suggested**) and your choice always wins: change it on the line,
   or later in the image's **Details**. With no suggestion the line says **No suggestion: please choose**.
3. Say what they show: the **Patient**, the **Wound** (W1), the **Body site** and where exactly, and when it was **Taken**.
   The camera's own date-time is removed on upload, so the time is yours to give. Photos of the same patient and wound are
   compared over time.
4. Each image is measured at once when its type is measured. The list shows its **Type**, its **size in code** (length ×
   width · area, or **Description only** for a type that is never measured), its **change** in area since the wound's first
   photo with a size, its status, who uploaded it and when it was taken. Narrow it with **Image type**, **Status**
   (Measured, Description only, No ruler: no size, Description to confirm, Could not read), **Body site**, **Patient** and
   **Made by**.

![Image review](dash-images "Image review: facets, the drop strip and the photos, with one open in the side panel")

Choose a photo to see it in the side panel with its **outline** (blue), the **ruler as found** (green, "Ruler found · 10 cm
· 70.2 px/cm") and its length and width lines. **Open** shows its own page: **Measurement**, **Description**, **Compare**,
**Privacy** and **Details**.

- **The size comes only from the ruler in the photo.** A photo without a ruler says **No ruler found: no size**: its outline
  is kept, but a size is never estimated. **Adjust outline** lets you draw the outline yourself (click round the wound, then
  **Done**): it is measured in cm against the photo's ruler, or in pixels only when there is none.
- **The description is a draft and not a diagnosis.** A local vision model fills the fields of the image's type from the
  image alone (a wound: wound bed, moisture, edges and the skin around it). A field it is unsure of reads **Not sure: please
  fill in**. **Confirm**, **Edit** or **Discard** it; only a confirmed description goes into a visit note or a report. The
  line under it says which type, prompt version and model wrote it ("Skin lesion · Skin lesion description (built in) v1
  on qwen3.5:9b").
- **Compare** shows the same wound's photos side by side, the area over time and "area down 56% since 19 Oct". Only
  photos with a ruler are on the chart; each uses its own ruler, so photos taken from different distances still compare.
![Compare](dash-images-compare "A photo's Compare tab: the same wound over time, the area chart and its table")

- **Privacy.** Location, date-time original and camera details are removed on upload and never stored. **Blur a region**
  (a face, a tattoo, a name band): draw a box over it and it is blurred in the stored photo itself, so in every copy
  (download, Documents, reports). The unblurred original is not kept, so blur before you send the photo on.

**Next steps:** **Send to Documents as a visit note** (a PDF with the photo, its size and the confirmed description),
**Download** (the photo, the photo with its measurement drawn, or the visit note), and under **⋮** **Add to a report** (an
image in Report Studio's Assets & branding) and **Start a pipeline** (the photo is kept in a bucket, then you describe the
pipeline to the AI Assistant).

## Image types
Each type has its own description prompt, the fields it fills, whether it is measured and against what, and what it never
says. **Image types** (the link in the page's header line) shows them all, one card each, with **Duplicate to edit** for
administrators.

| Type | Measured | Fields | Never says |
|---|---|---|---|
| Wound | Paper ruler · red region | wound bed, moisture, edges, around it | a diagnosis, stage, cause or treatment |
| Skin lesion | Paper ruler · dark region | colour, border, shape, surface | a diagnosis, "benign" or "suspicious", a risk |
| Burn | Paper ruler · red region (area only) | colours seen, blisters, surface | a depth or degree, % of body surface, a treatment |
| X-ray | Never | body part, view, image quality, markers | fractures, findings, "normal" or "abnormal" |
| Tissue slide | Never | stain seen, magnification (only if printed), image quality | findings, "abnormal", counts, a grade |
| Other photo | Never | a short summary | a diagnosis or advice |

- **A type that is never measured** (X-ray, Tissue slide, Other photo) has no **Measurement** tab. Its page reads
  **Description only · no size · not a diagnosis**: an X-ray's scale is in its DICOM file, which is not read, and a
  microscope's scale is not a paper ruler. A copy of one of these types is never measured either.
- **A skin lesion** is measured against the ruler like a wound; its **Measurement** tab says the target, **dark region** on
  skin.
- **X-rays:** local vision models are weak on X-rays, and the page says so. Check every field against the image. A pipeline
  routes on confirmed fields only, never on a draft.
- **The fixed rules apply to every type**, added by the platform in code and shown locked: no diagnosis, ever; no size from
  AI (sizes come only from a paper ruler, measured in code); a field the model is unsure of stays empty; always a draft until
  a person confirms it; local models only.
- A type an administrator switched off is listed at upload as **not offered in this workspace**. Earlier images keep their
  type and description.

## Ask about an image
The **Ask** tab of an image's page (and of the side panel) answers questions about what is visible: "Is the border the same
colour all the way round?", "Which view is this?", "Is the L marker visible?". Type the question and choose **Ask**.

- An answer is a **draft, not a diagnosis**. It names the prompt, its version, the model and how long it took. **Copy** it,
  or **Add to the visit note** (it is added to the image's note, marked as a draft answer).
- A question that asks for a diagnosis, a fracture, a stage, a depth, a degree, findings or a treatment ("Is there a
  fracture?", "Is this melanoma? Should we remove it?") is **Not answered**: a fixed reply says why and suggests the
  clinician, and **no model is asked** (nothing is billed for it).
- Every question and answer is kept with the image and listed in its **Details**.

## AI settings (administrators)
A workspace administrator sees **AI settings** in Image review's header. The sheet lists the image types with **Offered**,
**Prompt · model** and **Measured**; choose a type to change it:

- **Prompt**: the type's built-in prompt (marked **Platform**, read-only) or one of the workspace's prompts. Only prompts
  that fit can be chosen (JSON output and a photo input); one that does not says why. **Duplicate to edit** copies a built-in
  prompt into **Prompts**, where you change its wording; the fields come from the chosen prompt's output schema.
- **Model**: the models on the platform's list that read photos. A model that cannot be used says why (for example "text
  only: cannot read photos"). **Call timeout** and **Answer tokens** are optional.
- **Measurement**: on or off, and the target (**Red region** or **Dark region**). Types without a paper ruler are never
  measured.
- **Offered**: whether people can choose the type when they upload.
- **Add a type** makes your own, copied from a built-in one. The **type suggestion** and **Ask** have their own prompt, model
  and switch.
- **Try it** runs the saved choice and your change on a synthetic test image, side by side; a try is never saved to an image.
- **Save** says what is unsaved first; the line under it says who changed the settings last. A save applies to new images;
  earlier descriptions keep the prompt and model that wrote them.

Built-in prompts also appear in **Build › Pipelines › Prompts** (tag **Image review**) with a **Platform** pill: they are
read-only there too, with **Duplicate to edit**.

## Switching to a bigger model
Moving Image review to a bigger or better model is a change of settings only. Nothing is coded or deployed.

1. The platform administrator adds the model in **Platform › Models** (**Add a model**, runs on Ollama, the model name as
   `ollama list` shows it). Whether it **reads photos**, **thinks** and **uses tools** is detected from Ollama and shown in
   the list; only a model that reads photos can describe images.
2. Optionally, set its limits on the same page (**Change**): **Call timeout (seconds)**, **Answer tokens** and **Max
   parallel**.
3. A workspace administrator opens **Image review › AI settings** and picks the model for a type, for the type suggestion,
   or for Ask.
4. **Try it** on a synthetic test image to compare the saved choice with the new model.
5. **Save**.

### When a photo cannot be measured
Each state says why and what to do: **No ruler found** (upload a photo with the ruler flat beside the wound, or keep it
without a size), **Too dark** (retake it with the room light or the flash), **Too large** (send it at a smaller size, or
put it in a bucket and pick it from there) and **Upload failed** (not a photo: a scanned PDF goes to the Document
Converter). A file too large or not a photo is said on its line in **Upload images** as soon as you add it, and the
refusal's own message stays on the line after the upload.

## Limits
The drop strips, **Transcribe recordings** and **Upload images** say this platform's limits; when this was written they were:

| What | Limit |
|---|---|
| Files dropped at once | 20 documents; several recordings |
| A document to convert | 50 MB |
| A CSV or TSV to PDF | 500 MB; the PDF prints the first 5,000 rows |
| An XLSX to PDF | 100 MB |
| A converted file | 50 MB, 2,000 pages |
| Converter queue | 2 at once, 4 more waiting |
| A conversion not kept in a bucket | Listed 30 days, then removed |
| A recording | .mp3, .m4a, .wav or .ogg; upload up to 250 MB, from a bucket up to 500 MB; up to 30 minutes |
| A recording kept for playback | 30 days |
| A transcript | Kept until you delete it, or your workspace's retention removes it |
| A photo | JPG, PNG or HEIC; 25 MB each, 20 at once |
| A photo in Image review | Kept 30 days, unless sent to Documents or a report (then until your workspace's retention removes it) |

The results follow your workspace's **Data policies › Retention** (Transcripts, Audio recordings, Converted files, Image
review photos), and a legal hold keeps them. A conversion kept in a bucket is billed per document, as before; a transcript
by the minute of audio; an image once for each draft description, each type suggestion and each answered question (Images
described; a refused question is not billed); measuring is free (see
[How usage is counted](#bill-usage)).

## Example
Greta Fischer in health information at Summit Valley Health System receives a referral packet of four files. She drops
them on the Document Converter, chooses the discharge letter in the list, checks its result beside the original (its
table kept its columns), and sends it to Documents. Later she transcribes a 6-minute care call with exactly 2 speakers,
opens its page, searches it for "dressing", plays the nurse's advice from its time, and downloads the transcript with
personal details masked for the care team's meeting. On Friday the wound nurse uploads the third photo of a foot wound;
Image review measures it against the ruler, Compare shows the area down by half since the first visit, she confirms the
draft description after correcting the edges, and sends it to Documents as a visit note.
