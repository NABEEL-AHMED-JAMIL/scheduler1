---
id: dash-tools
title: Tools: Document Converter and Audio Transcript
summary: Convert several documents at once and check each result beside its original, and turn recordings into timed text you can play back, search and use.
section: Files and tools
who: Anyone whose page access includes Document Converter or Audio Transcript
where: See results › Tools › Document Converter (/tools/converter); See results › Tools › Audio Transcript (/tools/transcript)
related: dash-files, bill-usage
---
The two tools do by hand what a pipeline's steps do for many files: the **Document Converter** converts documents, and
**Audio Transcript** turns recordings into text, the same way a scheduled run does it. Both keep what they made, so
nothing is lost when you leave the page, and both are billed like the steps they stand in for.

Both pages work like the Report library: **facets** on the left with their counts (tick one or more to narrow the list),
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

## Limits
The drop strip and **Transcribe recordings** say this platform's limits; when this was written they were:

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

Both kinds of result follow your workspace's **Data policies › Retention** (Transcripts, Audio recordings, Converted
files), and a legal hold keeps them. A conversion kept in a bucket is billed per document, as before; a transcript by the
minute of audio (see [How usage is counted](#bill-usage)).

## Example
Greta Fischer in health information at Summit Valley Health System receives a referral packet of four files. She drops
them on the Document Converter, chooses the discharge letter in the list, checks its result beside the original (its
table kept its columns), and sends it to Documents. Later she transcribes a 6-minute care call with exactly 2 speakers,
opens its page, searches it for "dressing", plays the nurse's advice from its time, and downloads the transcript with
personal details masked for the care team's meeting.
