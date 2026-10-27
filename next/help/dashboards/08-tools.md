---
id: dash-tools
title: Tools: Document Converter and Audio Transcript
summary: Convert a document between formats or make a PDF from a dataset or a run, and turn a recording into text, by hand.
section: Files and tools
who: Anyone whose page access includes Document Converter or Audio Transcript
where: See results › Tools › Document Converter (/tools/converter); See results › Tools › Audio Transcript (/tools/transcript)
related: dash-files, bill-usage
---
The two tools do by hand, for one file, what a pipeline's steps do for many: the **Document Converter** converts a
document, and **Audio Transcript** turns a recording into text, the same way a scheduled run does it. Both are billed
like the steps they stand in for.

## Convert a document
1. Open **See results › Tools › Document Converter**.
2. Choose the source:
   - **Upload a file**: drop a document on the page, or **Choose a file**.
   - **From a bucket**: **Choose a file…** and search, filter and page through any bucket you can see.
   - **PDF from a dataset** or **PDF from a run**: rows printed into a PDF through a template, rather than a file
     converted.
3. The page says what the file was **Detected as**. Pick the format under **Convert to**.
4. Optionally, under **Save to bucket**, pick a bucket, a **Folder** (for example `converted/`) and a **Name**.
   Left empty, the file goes to the bucket's root under its own name.
5. Choose **Convert**, then **Download** the result.

**Supported formats** lists, for each family (Office, OpenDocument, PDF, Markdown and images), what it converts
**From** and **To**. The chip in the panel's corner shows the converter's queue right now. **Recent conversions** lists
what was saved to a bucket, with links to the original and the converted file.

![Document Converter](dash-converter "Document Converter: the limits, the four sources, and Recent conversions")

## Turn a recording into text
1. Open **See results › Tools › Audio Transcript**.
2. Under **Choose the recording**, **Upload a file** (drop an .mp3 or .m4a) or pick one **From a bucket**.
3. Tick **Include timestamps before each segment** if you want them.
4. Choose **Extract transcript**. A long recording can take a few minutes; the page says so while it works.
5. Read the **Transcript** as a **Timeline** (each segment with its time, which you can copy, and a play button to have
   it read aloud from there), **Table** or **Console**. **Read aloud** and **Copy** are above it.

![Audio Transcript](dash-transcript "Audio Transcript: what it takes, upload or a bucket, and timestamps")

> **Note:** If the converter or the transcriber is busy, the page tells you so. Nothing is lost: try again in about 30
> seconds.

## Limits
The limits strip at the top of each tool shows this platform's limits; when this was written they were:

| What | Limit |
|---|---|
| A document to convert | 50 MB |
| A CSV or TSV to PDF | 500 MB; the PDF prints the first 5,000 rows |
| An XLSX to PDF | 100 MB |
| A converted file | 50 MB, 2,000 pages |
| Time to convert | 140 seconds a file |
| Converter queue | 2 at once, 4 more waiting |
| A recording | .mp3 or .m4a; upload up to 250 MB, from a bucket up to 500 MB |
| Time to transcribe | Up to 30 minutes a recording |

A recording over the upload limit can go to a bucket first. Conversions are billed per document and transcripts by
the minute of audio (see [How usage is counted](#bill-usage)).

## Example
Greta Fischer in health information at Summit Valley Health System receives a discharge letter as a DOCX. She converts
it to PDF, saves it to `docs/letters/` and attaches it to the record. Later she transcribes a 6-minute care call with
timestamps, copies it, and checks what was agreed.
