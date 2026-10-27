---
id: doc-file-drop
title: The file drop
summary: Drop files for pipelines; set the storage connection and size limit, see what arrived, and start a schedule when a file lands.
section: Send documents in
who: Anyone whose page access includes the file drop uploads; workspace administrators set it up and change its settings
where: Documents › Intake › File drop (/documents/intake/file-drop); Pipelines › Schedules (/pipelines/schedules)
related: con-storage, doc-intake, doc-limits
---
The file drop is for files a pipeline should work on, not documents to read: a CSV export, a batch of wound photos, an
X-ray, a spreadsheet from finance. Each file is checked, stored in the workspace's bucket, and starts every schedule set
to start when a matching file arrives. It is not read as a document.

![The File drop section](doc-file-drop "File drop: Upload, its Settings, and the newest arrivals with who uploaded them")

## Set it up (administrators)
Until it is set up, the section says **No file drop yet**.

1. Open **Documents › Intake › File drop** and choose **Set up the file drop** (or, later, **Change** under
   **Settings**).
2. Pick the **Storage connection** the files go to: one of the workspace's own. Files land under `intake/` in its
   bucket.
3. Optionally set a **Size limit (MB)** below the platform's. Empty means the platform's limit, which the dialog names.
4. Choose **Turn on the file drop** (or **Save changes**).

![File drop settings](doc-file-drop-settings "File drop settings: the storage connection and an optional size limit")

**Turn off**, in the same dialog, stops uploads after you confirm: members can no longer upload and no new file starts
a run. The files already stored stay in the bucket, and you can turn it on again later.

## Drop files
1. Drag files onto **Drop files here**, or choose **Choose files**. Several at once is fine: they are sent one by one.
2. **This session's uploads** shows each file **Queued**, **Uploading**, **Uploaded** with its SHA-256, or
   **Refused** with why. **Clear finished** tidies the list.

Choose **What the file drop accepts** to see the kinds it takes: data files (CSV, TSV, TXT, JSON, JSON Lines, XML,
YAML, Parquet), documents (PDF, Markdown, Word, Excel, PowerPoint), images (PNG, JPEG, GIF, TIFF), audio and video
(MP3, WAV, M4A, MP4) and archives (ZIP, GZ).

> **Warning:** Executables and scripts are refused whatever they are named, and a file's contents must match its
> extension. A refused file is not stored. Files are not scanned for viruses, so drop only files you trust.

## Where files land
Each file is stored as `intake/<date>/<arrival>-<file name>` in the chosen connection's bucket. **Arrivals** lists the
newest 50: **File** (with its type and the key a pipeline's read step names it by, which you can copy), **Size**,
**Uploaded by**, **Uploaded** and **SHA-256**. Files can also arrive through the API.

## Start a pipeline when a file arrives
Which files start which pipeline is set on the schedule, not here:

1. Open **Pipelines › Schedules** and the schedule (or make a new one).
2. Under **When it runs**, in **Also starts when**, turn on **A file arrives**.
3. In **Which files**, give a pattern: `*` matches any run of characters and `?` one, so `*.csv` or `wound-*.jpg`.
   Leave it blank for every file.
4. In **Files per run**, `1` starts a run per file; a larger number lets files that waited go together, up to that
   many.
5. Save the schedule.

A file that lands while a run is going waits its turn. The runs a file started are listed on each schedule.

## Example
On Ward 4B, Daniel Kim photographs a wound at each dressing change and drops the photo in the file drop. The photos land
in Summit Valley's `summit-valley-s3` bucket under `intake/`, within its 25 MB limit, and each one starts the
wound-measurement schedule set to start on `wound-*.jpg`.
