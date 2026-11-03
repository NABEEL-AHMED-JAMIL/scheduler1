---
id: ai-transcription
title: Turn recordings into text
summary: The Transcribe audio step and the Audio Transcript tool: recordings to text with their times, kept, played back and searched, and what is billed.
section: AI at work
who: Workspace administrators add the step to a pipeline; anyone whose page access includes Tools › Audio Transcript uses the tool
where: See results › Tools › Audio Transcript (/tools/transcript); Build › Pipelines (/pipelines/list)
related: ai-steps, ai-costs, run-items
---
Recordings (care calls, telehealth visits, dictated notes) become text with the platform's own transcriber, the same one
in a pipeline and on the tool page. A pipeline can then summarise the text with an [AI prompt step](#ai-steps), write a
report for each call, or search it in Ask your data.

## Transcribe recordings by hand
1. Open **See results › Tools › Audio Transcript** and choose **Transcribe recordings** (or drop recordings anywhere on
   the page).
2. Add one or more recordings (.mp3, .m4a, .wav or .ogg), or pick one **From a bucket…**. Each recording's length is read
   before it is uploaded, and the panel says about how long it takes and how many audio minutes are billed. **Speakers**
   finds 2 to 6 by itself, or takes **One speaker** or **Exactly 2** to **6**.
3. Choose **Transcribe**. It runs on the server: the recording shows its progress in the list, and you can leave the
   page.
4. When it is ready, choose it in the list for a side panel with a compact player and the first lines, or **Open
   transcript** for its own page: one player row, the transcript as a table (choose a time to play from there), search
   with every match marked on the track, one **All speakers** filter, and **Download** (text, subtitles, JSON or PDF),
   **Send to Documents** as a visit note, or **Start a pipeline** with it.

The list shows the recordings of the last 7, 30 or 90 days, or all of them, with facets for status, who made them,
speakers and language; the transcripts stay until you delete them (or your workspace's retention removes them), and the
recording itself is kept 30 days for playback if you chose to keep it. See
[Tools: Document Converter and Audio Transcript](#dash-tools) for the page, speakers and masking.

![The Audio Transcript tool](ai-transcript "See results › Tools › Audio Transcript: the recordings, with a finished one open in the side panel")

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
tool page a recording waits in line ("Queued · 3rd") and starts by itself; nothing is lost if you close the page.

## Example
Summit Valley Home Health drops each care call (`call-*.m4a`) into the workspace inbox. *Care-call insight, one report per
call* transcribes it, asks *Call insight (JSON)* for the reason, follow-up and concerns, and makes one report for each call.
Tamara Brooks (Home health nurses) reads the transcript beside the insight before anything is shared.

## Limits
| What | Limit |
|---|---|
| Formats in a pipeline | mp3, m4a, wav, ogg, flac, webm |
| Formats on the tool page | mp3, m4a, wav, ogg |
| Size | Upload up to 250 MB on the tool page; a recording in a bucket up to 500 MB |
| Length on the tool page | Up to 30 minutes a recording (longer ones can be split into parts) |
| Kept on the tool page | The transcript until deleted; the recording 30 days, for playback |
| At most files in a step | Default 20 |
| Billed | By the minute of audio (see [What AI costs](#ai-costs)) |
