---
id: dash-files
title: Files: browse, preview and chat with a file
summary: Walk the storage behind each connection, preview any file, upload, email or download it, and ask a model about it with File Chat.
section: Files and tools
who: Anyone whose page access includes Browse files; adding a storage connection is a workspace administrator's
where: See results › Analysis › Files (/data/files)
related: dash-studio, dash-catalog, dash-tools
---
**Files** (the page is titled **Browse files**) shows the storage behind each of your workspace's connections: the
files your runs wrote, the uploads, the documents that came in. Every file opens in a preview, and any document can be
asked about with **File Chat**.

## Browse
1. Open **See results › Analysis › Files**. Each storage connection is a card; type in **Search connections** to find
   one.
2. Choose a card. The folders and files are listed with their **Name**, **Modified**, **Size** and **Type**; the path
   above the list takes you back up.
3. Narrow the list with **Find a file…** and **Modified from** / **Modified to**. The line beside them counts the
   folders, files and bytes shown.
4. **Insights** charts what is here, the file types, when they last changed and the largest files.

![Files](dash-files "Browse files: a connection's folders and files, with the filters and Insights")

> **Note:** *No storage is connected yet* means the workspace has no storage connection. A workspace administrator adds
> one under **Get data in › Connections › Storage**.

## Open, preview and share a file
Open a file's ⋯ menu:

- **View** previews it: a PDF page by page, an image with zoom, a table 100 rows at a time with a search, an archive's
  entries, audio and video to play. A file nobody can preview shows its first bytes, so you can tell what it is.
- **Details** shows its size, type, path and checksum, who uploaded it or which pipeline run wrote it (**Made by**), and
  its **Retention**: the policy that keeps it and when it expires.
- **Download** saves it; **Email this file** sends it to a **Recipient** with an optional **Message**.
- **Copy path** and **Copy checksum (ETag)** copy those for a pipeline's settings or a support request.
- **Delete** removes it, after you confirm.

Tick several files to **Download**, **Email** or **Delete** them together. **New folder**, **Upload** and **Upload
folder** (every file inside it, keeping its sub-folders) add to the folder you are in. A folder's ⋯ menu also has
**Rename**.

> **Warning:** **Delete** removes the file from your storage itself, not only from this list. A pipeline or a dashboard
> that reads it will find nothing.

## Ask about a file with File Chat
1. In the file's ⋯ menu choose **Chat with this file**. The chat opens in the corner of the page.
2. Pick the **Agent** to ask, if there is more than one.
3. Type in **Message** and send. **View** opens the file beside the chat.

A long file may be longer than the model can read at once: the chat then says *Answers cover the first* so many
characters, or that answers are drawn from the excerpts most relevant to each question. Each answer can be copied.

> **Warning:** A File Chat answer is a model's DRAFT. Check it against the file before you use it.

## Example
At Summit Valley Health System, Jordan Reyes opens the week's operations board pack PDF under `ops/board/`, chooses
**Chat with this file** and asks *Which ward had the most delayed discharges?* The answer quotes the page it came from,
and he checks it in **View** before passing it on.
