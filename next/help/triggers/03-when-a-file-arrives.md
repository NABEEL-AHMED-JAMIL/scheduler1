---
id: trg-file
title: Start a pipeline when a file arrives
summary: The workspace inbox and File drop, which files start which schedule, one pipeline for both a timetable and the inbox, and reading only new files.
section: Start on arrival
who: Anyone whose page access includes Schedules & triggers sets the trigger; File drop needs it in your page access, and its settings an administrator
where: Build › Pipelines › Schedules & triggers (/pipelines/schedules); Get data in › Documents › Intake › File drop (/documents/intake/file-drop)
related: trg-schedules, trg-form, step-read, pl-placeholders, doc-file-drop
popular: Start a pipeline when a file arrives
---
Each workspace has an **inbox**: a place where arriving files are checked, stored in the workspace's bucket, and handed
to every schedule set to start when a matching file arrives. People put files in it from **File drop**; a form's
submissions land there too.

## Put files in the inbox

1. Open **Get data in › Documents › Intake** and its **File drop** section (more in [File drop](#doc-file-drop)).
2. Drop files on **Drop files here** (several at once are sent one by one), or pick them.
3. Each file shows **Uploaded** or **Refused**, with the reason. **What the file drop accepts** lists the file types.

The **Settings** card shows the storage connection the files go to, **Where files land**
(`intake/<date>/<arrival>-<file name>`) and the **Size limit**.

> **Note:** Executables and scripts are refused whatever they are named, and a file's contents must match its
> extension. A refused file is not stored. Files are not scanned for viruses.

## Make a schedule start when a file arrives

1. Open the schedule in **Build › Pipelines › Schedules & triggers** (or make a new one).
2. Under **Also starts when**, tick **A file arrives**.
3. **Which files**: a pattern for the file's name: `*` matches any run of characters, `?` one. Blank for every file.
   For example `call-*.m4a` or `invoices_*.pdf`.
4. **Files per run**: 1 makes each file its own run. More: files that waited for a run go together, up to this many,
   and the pipeline reads them all.
5. Save. **What you will get** says "Also when a file arrives in the inbox matching …".

A file that lands while a run is going waits its turn; files waiting are taken in the order they arrived.

![A schedule that runs hourly and also when a recording arrives](trg-file "One schedule, two ways in: every hour, and whenever a call-*.m4a file arrives")

## Read the file the run was started for

The pipeline's first step decides what it reads:

- **Read CSV/JSON/Parquet** with **Bucket** and **File** left empty reads the run's own file.
- **Read S3** with **The run's own files first** on reads the files the run was started for; any other run reads its
  **Prefix**. The file steps (**Transcribe audio**, **Convert file**, **Split pages**) then work through them.
- Steps can name the file with `{{input_key}}`, `{{input_name}}`, and for a batch `{{input_count}}` and
  `{{input_keys}}`.

## One pipeline for a timetable and the inbox

Give the schedule both a timetable (**On a timetable**, **Hourly**, say) and **A file arrives**, and set the pipeline's
**Read S3** step to:

1. **The run's own files first**: on, so an arrival's run reads just that file.
2. **Which objects**: `last_run`, so a timetable run reads only the objects written since the schedule's last completed
   run, oldest first. A failed run moves nothing on, so its files come again next time.

Files that arrive are handled at once; the hourly run sweeps up anything that came another way.

## Example

Summit Valley's home-health team records care calls. **Care-call insight, one report per call** runs **Hourly** and
also when a file named like `call-*.m4a` arrives. Its **Read S3** step reads `home/calls/` with **The run's own files
first** on and **Which objects** `last_run`; each call is transcribed, summarised as a DRAFT and made into its own
report for the nurse, Tamara Brooks, to check.

## Limits

| What | Limit |
|---|---|
| Which files | A file's name, not a folder; at most 255 characters |
| Files per run | 1 to 50 |
| File size | The size limit shown on File drop |
