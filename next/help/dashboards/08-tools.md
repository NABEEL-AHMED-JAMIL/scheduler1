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

## Convert documents
1. Open **See results › Tools › Document Converter**.
2. Drop up to 20 files on **Drop files here**, or **Choose files…**, or pick one **From a bucket…**. Each file gets a row
   with its type, its size and the format it becomes. A file the converter does not read (a recording, an archive) is
   said at once, with where to go instead.
3. Pick the format per file, or for every waiting file with **Convert all to**.
4. Optionally, under **Keep results**, choose a bucket and a folder (for example `converted/2026-11/`). Not kept, a
   result stays 30 days in **Recent conversions** and is then removed.
5. Choose **Convert N waiting files**. Two convert at a time; the others wait their turn. If the converter is busy a file
   waits and is sent again by itself.

A failure is said in plain words with what to do next: **Too large to convert** names the limit and suggests splitting
the file; **Protected with a password** says how to remove the password and drop the file again.

![Document Converter](dash-converter "Document Converter: the queue on the left, the result beside its original on the right, and Recent conversions")

## Check a result and use it
Choose a finished file in the queue (or the eye in **Recent conversions**). The result opens beside its original,
**Side by side** or **Result only**, page by page, with the converter's checks underneath: the pages as in the original,
the fonts embedded, a font that was replaced (for example Calibri by Carlito, which has the same widths), and whether the
text can be selected and searched. Then:

- **Download** the result;
- **Send to Documents…** reads a PDF or an image as a document type (for example a discharge summary) and puts it in the
  review queue; offered to people who can open Documents;
- **Start a pipeline…** keeps the result in a bucket first if it is not, then opens the AI Assistant with the file named;
- **Keep in a bucket…** saves it to a folder you choose.

**Recent conversions** lists every conversion of the last 7, 30 or 90 days, failed ones too, with where each was kept.
Filter by **Everyone**, **Mine** or **Failed**, search by file name or format, and tick rows for **Download selected**
(one zip). **Supported formats** opens a side sheet with each family's formats and a search (type `.vsdx`).

> **Note:** A PDF made from a dataset or from a run is a report, not a file conversion: make it from
> **Reports › From pipelines** with **PDF from a dataset or a run**.

## Turn a recording into text
1. Open **See results › Tools › Audio Transcript** and choose **New transcript**.
2. Drop one or more recordings (.mp3, .m4a, .wav or .ogg), or pick one **From a bucket…**. The length of each is read
   from the file before it is uploaded.
3. Give it a **Name**. **Language** is detected in each part of the recording. **Speakers** labels who said what where
   speaker detection is installed; otherwise the page says so and the transcript is one stream of text.
4. Choose whether to **Keep the recording 30 days for playback**, **Mask personal details in exports**, and **Send to
   Documents as a visit note when done**.
5. The page says about how long it takes and how many audio minutes are billed. Choose **Transcribe**.

The recording is transcribed on the server: the card shows its stages (**Uploaded**, **Speech found**, **Transcribing**,
**Ready**), how much has been heard, the time left and the text heard so far. You can leave the page; it keeps going, and
the recording is in the **Recordings** list when you come back. **Stop** stops it, and nothing is billed.

![New transcript](dash-transcript-new "Audio Transcript: a new transcript, one in progress, and what could not be transcribed")

## Play back, search and use a transcript
Choose a recording in **Recordings** (search names and what was said; **Everyone**, **Mine**, **Failed**).

- The player shows the recording's waveform; **Space** plays and pauses, **J** and **L** go back and forward 5 seconds,
  **/** jumps to the search, and the speed goes from 0.75× to 2×.
- Each part of the transcript has its time; choose it to play from there. With **Follow playback** on, the part being
  played is highlighted and kept in view.
- **Search what was said** shows `3 of 7` with next and previous, and marks each match on the waveform.
- **Transcript**, **Table** and **Plain text** show the same words three ways. **Correct text** lets you fix a word;
  corrections are kept as a new version and the original stays.
- **Use this transcript**: **Download** as text with times, subtitles (.vtt or .srt), JSON or a printable PDF; **Send to
  Documents as a visit note…**; **Start a pipeline…**; **Copy text**.
- **Speakers** (where installed): name each speaker once ("Speaker 1" → "Alex Morgan, RN") and every export uses the
  name; merge two speakers who are one person.
- **Personal details heard** counts the names, dates of birth and phone numbers heard. Turn on **Mask in exports** to
  replace them with [NAME], [DOB] and [PHONE] in every download.

![Audio Transcript](dash-transcript "Audio Transcript: the recordings, the player and the transcript with search, and how to use it")

### When a recording cannot be transcribed
Each failure says why and what to do next: **too long** (up to 30 minutes; **Split at 30 min** makes parts that are
transcribed one by one), **no speech heard** (**Choose another**), **the transcriber is busy** (it is queued and starts
by itself), and **not a recording** (a Word file goes to the Document Converter).

## Limits
The **Limits** button and **What it takes** show this platform's limits; when this was written they were:

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
them together, converts them to PDF, checks the discharge letter beside its original (its table kept its columns), and
sends it to Documents. Later she transcribes a 6-minute care call, searches it for "dressing", and downloads the
transcript with personal details masked for the care team's meeting.
