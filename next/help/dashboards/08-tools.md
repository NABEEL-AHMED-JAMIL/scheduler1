---
id: dash-tools
title: Tools: Document Converter, Audio Transcript and Image review
summary: Convert several documents at once and check each result beside its original, turn recordings into timed text you can play back, search and use, and measure wound photos against the ruler in them.
section: Files and tools
who: Anyone whose page access includes Document Converter, Audio Transcript or Image review
where: See results › Tools › Document Converter (/tools/converter); See results › Tools › Audio Transcript (/tools/transcript); See results › Tools › Image review (/tools/images)
related: dash-files, bill-usage
---
The tools do by hand what a pipeline's steps do for many files: the **Document Converter** converts documents,
**Audio Transcript** turns recordings into text, and **Image review** measures wound photos, the same way a scheduled run
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
**Image review** is for wound photos and other clinical photos. It measures the wound against the paper ruler in the photo,
in code, and drafts a description for a nurse to confirm. It does not diagnose.

1. Open **See results › Tools › Image review**. Drop photos anywhere on the page (JPG, PNG or HEIC, up to 20 at once, 25 MB
   each), or use **Upload photos**, **Choose photos…**, **From a bucket** or **From Documents**.
2. Say what they show: the **Patient**, the **Wound** (W1), the **Body site** and where exactly, and when it was **Taken**.
   The camera's own date-time is removed on upload, so the time is yours to give. Photos of the same patient and wound are
   compared over time.
3. Each photo is measured at once. The list shows its **size in code** (length × width · area), its **change** in area since
   the wound's first photo with a size, its status, who uploaded it and when it was taken. Narrow it with **Status**
   (Measured, No ruler: no size, Description to confirm, Could not read), **Body site**, **Patient** and **Made by**.

![Image review](dash-images "Image review: facets, the drop strip and the photos, with one open in the side panel")

Choose a photo to see it in the side panel with its **outline** (blue), the **ruler as found** (green, "Ruler found · 10 cm
· 70.2 px/cm") and its length and width lines. **Open** shows its own page: **Measurement**, **Description**, **Compare**,
**Privacy** and **Details**.

- **The size comes only from the ruler in the photo.** A photo without a ruler says **No ruler found: no size**: its outline
  is kept, but a size is never estimated. **Adjust outline** lets you draw the outline yourself (click round the wound, then
  **Done**): it is measured in cm against the photo's ruler, or in pixels only when there is none.
- **The description is a draft and not a diagnosis.** A local vision model writes the wound bed, moisture, edges and the
  skin around it from the photo alone. A field it is unsure of reads **Not sure: please fill in**. **Confirm**, **Edit** or
  **Discard** it; only a confirmed description goes into a visit note or a report.
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

### When a photo cannot be measured
Each state says why and what to do: **No ruler found** (upload a photo with the ruler flat beside the wound, or keep it
without a size), **Too dark** (retake it with the room light or the flash), **Too large** (send it at a smaller size, or
put it in a bucket and pick it from there) and **Upload failed** (not a photo: a scanned PDF goes to the Document
Converter).

## Limits
The drop strips, **Transcribe recordings** and **Upload photos** say this platform's limits; when this was written they were:

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
by the minute of audio; a photo once for each draft description (Images described); measuring is free (see
[How usage is counted](#bill-usage)).

## Example
Greta Fischer in health information at Summit Valley Health System receives a referral packet of four files. She drops
them on the Document Converter, chooses the discharge letter in the list, checks its result beside the original (its
table kept its columns), and sends it to Documents. Later she transcribes a 6-minute care call with exactly 2 speakers,
opens its page, searches it for "dressing", plays the nurse's advice from its time, and downloads the transcript with
personal details masked for the care team's meeting. On Friday the wound nurse uploads the third photo of a foot wound;
Image review measures it against the ruler, Compare shows the area down by half since the first visit, she confirms the
draft description after correcting the edges, and sends it to Documents as a visit note.
