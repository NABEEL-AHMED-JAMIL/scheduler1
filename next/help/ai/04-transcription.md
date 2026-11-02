---
id: ai-transcription
title: Turn recordings into text
summary: The Transcribe audio step and the Audio Transcript tool: recordings to text, with or without times, and what is billed.
section: AI at work
who: Workspace administrators add the step to a pipeline; anyone whose page access includes Tools › Audio Transcript uses the tool
where: See results › Tools › Audio Transcript (/tools/transcript); Build › Pipelines (/pipelines/list)
related: ai-steps, ai-costs, run-items
---
Recordings (care calls, telehealth visits, dictated notes) become text with the platform's own transcriber, the same one
in a pipeline and on the tool page. A pipeline can then summarise the text with an [AI prompt step](#ai-steps), write a
report for each call, or search it in Ask your data.

## Transcribe one recording by hand
1. Open **See results › Tools › Audio Transcript**.
2. Choose **Upload a file** and drop an .mp3 or .m4a, or choose **From a bucket** and pick one you can see.
3. Tick **Include timestamps before each segment** if you want each stretch of speech with its time.
4. Choose **Extract transcript**. Transcription runs on the server and can take a few minutes for a long recording.
5. Read the **Transcript**: **Copy** it, **Read aloud**, or copy a timestamp to point a colleague at a moment.

![The Audio Transcript tool](ai-transcript "See results › Tools › Audio Transcript: the formats and limits above the drop zone")

## Transcribe in a pipeline
1. In the pipeline's **Steps**, add **Transcribe audio** from **Add step from the Task Registry…**.
2. Say which recordings: the files the run was started for (a recording dropped in the inbox, for example), or the rows of
   an earlier step that name a file.
3. Tick **Timestamps** to add `segments`: each stretch of speech with its start and end, as JSON.
4. **When a file fails**: fail the step, skip the row, or keep it with the transcript empty. A kept row says why in
   `transcribe_status` and `transcribe_error`.
5. **Calls at once** transcribes several files at the same time; **At most files** refuses a larger input before any file
   is read.

Each row gets `file_name`, `file_stem`, `transcript`, `language` and `duration_seconds`, and with timestamps `segments`.
Each recording is an item of the run, so the run's **Items** tab shows how each one went (see
[The Items view](#run-items)).

> **Tip:** A silent or damaged recording need not stop the others. Set **When a file fails** to keep the row: the run
> completes, and the row says why that one has no text.

## When the transcriber is busy
A busy transcriber is waited for and asked again, up to six tries, waiting at most five minutes between two tries. On the
tool page you are told it is busy; nothing is lost, and you try again in about 30 seconds.

## Example
Summit Valley Home Health drops each care call (`call-*.m4a`) into the workspace inbox. *Care-call insight, one report per
call* transcribes it, asks *Call insight (JSON)* for the reason, follow-up and concerns, and makes one report for each call.
Tamara Brooks (Home health nurses) reads the transcript beside the insight before anything is shared.

## Limits
| What | Limit |
|---|---|
| Formats in a pipeline | mp3, m4a, wav, ogg, flac, webm |
| Formats on the tool page | mp3, m4a |
| Size | Upload up to 250 MB on the tool page; a recording in a bucket up to 500 MB |
| Time on the tool page | Up to 30 minutes a recording |
| At most files in a step | Default 20 |
| Billed | By the minute of audio (see [What AI costs](#ai-costs)) |
