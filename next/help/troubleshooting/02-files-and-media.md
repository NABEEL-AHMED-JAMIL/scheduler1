---
id: ts-files
title: Files and media
summary: A photo that cannot be measured, a file that will not convert, and a recording with nothing to transcribe.
section: By message
who: Anyone whose page access includes Runs reads the messages; changing a step's settings is for whoever may edit the pipeline
where: Run & review › Runs (/runs/latest); Build › Pipelines (/pipelines/list)
related: ts-runs, ts-documents
---
Steps that work on files (photos, documents to convert, recordings) meet files that are dark, broken or empty. Each of
these steps has a setting that says what to do then: fail the step, skip that file, or keep its row with the reason.
Choose it before the run, and one bad file never costs you the others.

| Step | Its setting | Choices |
|---|---|---|
| Measure image | **When a photo cannot be read** | `fail` the step, `skip` the row, or `null`: keep it with the sizes empty and the reason in the note (the default) |
| Convert file | **When a file fails** | `fail` the step (the default), `skip` the row, or `null`: keep it with no result, the reason in `convert_error` |
| Transcribe audio | **When a file fails** | `fail` the step (the default), `skip` the row, or `null`: keep it with the transcript empty, the reason in `transcribe_error` |

## A photo that cannot be measured
**The messages:**
- `Row 4: The file is not a png or jpg image.` The file is not a readable photo: broken, or another format.
- `"wound-17.tif" is not a png or jpg image.` The key names a file of another type.
- `The row has no image key.` The column that should name the photo is empty for that row.
- In the note column, `no ruler found: not measured`. The photo is readable, but no ruler was found in it (a photo too
  dark, or taken without the ruler), so nothing was measured. This is not an error: the row is kept and its sizes are
  empty.

**Fix:** replace the photo in the bucket with a readable png or jpg, with the centimetre ruler in view, then on the run's
**Items** tab choose **Retry failed items**: only the photos that failed run again, from the step they failed at. With
**When a photo cannot be read** set to `null`, the run completes and warns "2 photo(s) could not be read: their sizes
are empty."

![A run whose photo could not be measured](ts-photo "Attempt 1: the measuring step failed on row 4; attempt 2, after the photo was replaced, completed")

> **Note:** The step measures with code against the ruler, never with a model. A model may describe the photo in a
> later step; its description is a DRAFT for a person to check.

## A file that will not convert
**The messages** (each starts with the file's name, or "Row N"):
- `Conversion failed — the file may be corrupt or password-protected: …` A damaged file, or one with a password.
- `Conversion timed out after N seconds and LibreOffice was restarted. A very large document can take longer than
  that: split it, or convert a smaller part.`
- `'xyz' isn't a supported input format.` or `Can't convert a spreadsheet to 'pptx' — valid targets are: …`
- `'letter' has no extension, so its format is not known.`
- `The converter is busy: 4 conversion(s) running and 6 waiting. Try again in a minute.`

**Fix:** open the file on your own computer; save a damaged or password-protected file again without the password; pick
a target the message lists; give the file its extension. For a busy converter, retry a minute later. With **When a file
fails** set to `skip`, the run completes, and its log counts the files converted and those that failed and were
skipped.

## A recording with nothing to transcribe
**The messages:**
- `The recording is silent or nearly silent (98% of it below -50 dBFS) -- there is nothing to transcribe.`
- `No speech was found in this recording -- there is nothing to transcribe.`
- `The recording is only 0.30 seconds long -- at least 0.5 seconds of audio is needed.` (the first number is the
  recording's)
- `The recording is 5.2 hours long, over the 4-hour transcription limit. Split it and transcribe the parts.`
- `The recording is distorted throughout (60% of samples clipped) -- it cannot be transcribed reliably.`
- `This file could not be read as audio -- it may be damaged, or not really the type its name says.`

**Why:** the transcriber checks a recording before it transcribes it, and refuses one it cannot hear anything useful in.
The limits are those of the transcriber: at least half a second, at most 4 hours, unless the platform set others.

**Fix:** check the recording plays and has speech; record again, or split a long one. To keep the other recordings of a
run going, set **When a file fails** to `null`: each refused file keeps its row with `transcribe_status` failed and the
sentence above in `transcribe_error`, so a later step can filter them out or send a notice.

> **Tip:** When the transcriber is busy, the step waits and asks again by itself, and the log says so: "The
> transcriber is busy (…); <file> waits N s and asks again (try N of M)."

## Learn more
- Retrying and reading a failure: [When a run or a step fails](#ts-runs).
- Documents and reports: [Documents, forms and reports](#ts-documents).
