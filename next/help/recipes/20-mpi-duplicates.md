---
id: rcp-mpi-duplicates
title: Find duplicate patient records
summary: Tidy the names in a master patient index and keep one record per person, so near-duplicates such as "MARSH" and "marsh " count once.
section: Healthcare
who: A workspace administrator builds and runs it
where: Build › Pipelines (/pipelines/list); See results › Analysis › Files (/data/files)
related: step-shape, pl-builder, pl-try, run-page, dash-files
popular: Remove duplicate rows from a file
---
A master patient index collects the same person more than once: typed in capitals at one desk, with a stray space at
another. This recipe builds a pipeline that tidies the names and keeps one record per person, judged by last name,
first name and date of birth. It needs no API, no model and no other set-up, so it is a good first pipeline.

> **Note:** Every name and date in the sample file is fictional.

## What you'll build

A pipeline **Duplicate patient records (master index)** of six steps: read the index, trim the spaces from the names,
put them in lower case, sort them, remove the duplicates, and keep the unique records as a file. It runs when you press
**Run now**.

![The pipeline's steps](rcp-x-mpi-steps "Summit Valley's Duplicate patient records pipeline: read, two Transform steps, Sort, Remove duplicates and Save File")

## What you need first

1. **A storage connection** for the workspace (**Get data in › Connections › Storage**, see
   [Connect your storage](#con-storage)). This recipe calls it *your bucket*.
2. **The sample file** [patients.csv](/help/samples/mpi-duplicates/patients.csv): 500 records with the columns
   `patient_id`, `first_name`, `last_name`, `dob` and `city`. 480 people are in it once; 20 of them appear a second time
   with their name in capitals, in lower case or with spaces around it.
3. **Put the file in your bucket**: open **See results › Analysis › Files**, choose your bucket's card, choose **New
   folder** and name it `mpi`, open it and choose **Upload** (see [Files](#dash-files)). The file's key is then
   `mpi/patients.csv`.

## Build it

1. Open **Build › Pipelines** and choose **New pipeline**. Under **Add steps yourself**, type the **Name**
   `Duplicate patient records (master index)` and choose **Create and add steps**.
2. On the **Steps** tab, add the six steps below with **Add step from the Task Registry…**, in this order. For each,
   type the **Key**, fill in the settings and choose **Apply**.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `mpi` | **Bucket** your bucket; **File** `mpi/patients.csv` |
| 2 | Transform | `norm` | Two **Mappings**: **Column** `first_name`, **Operation** `trim`, **From column** `first_name`; and the same for `last_name`. **Keep the other columns** on |
| 3 | Transform | `lower` | The same two mappings with **Operation** `lower`. **Keep the other columns** on |
| 4 | Sort | `ordered` | **Sort by** `last_name`, then `first_name`, then `dob`, each `asc` |
| 5 | Remove duplicates | `unique` | **Key columns** `last_name`, `first_name`, `dob`; **Keep** `first`; **Ignore case** on |
| 6 | Save File | `keep` | **File name** `mpi-unique.csv`; **Format** `csv` |

3. Choose **Validate** in the save bar. It should say "The definition is valid."
4. Choose **Save**, then **Run now** at the top of the page. With no schedule yet, the console gives the pipeline an
   on-demand one and runs it.

> **Tip:** Want to see the rows before you trust the file? Open the run, then choose the output of any step on the
> **Steps** tab: each step keeps its rows for 24 hours.

## Check it worked

The run's page (**Run & review › Runs**, or the panel that opens after **Run now**) shows:

| Step | Rows in → out |
|---|---|
| Read CSV/JSON/Parquet | 0 → 500 |
| Transform (trim) | 500 → 500 |
| Transform (lower) | 500 → 500 |
| Sort | 500 → 500 |
| Remove duplicates | 500 → **480** |
| Save File | 480 → 480 |

The run is **Completed**, 6 of 6 steps. Its **Outputs** tab holds `mpi-unique.csv` with 480 rows, the names in lower
case.

![A completed run](rcp-x-mpi-run "Summit Valley's run: 5,000 index records became 4,880 unique patients")

Summit Valley's own index has 5,000 records; its run kept 4,880.

## Common mistakes

- **No duplicates are removed.** Check that both Transform steps have **Keep the other columns** on (otherwise `dob`
  is dropped before **Remove duplicates** sees it), and that **Key columns** name exactly `last_name`, `first_name` and
  `dob`.
- **The file is not found.** **File** is the key inside the bucket, `mpi/patients.csv`, without the bucket's name.
- **The result keeps capitals.** The second Transform must use `lower`; **Ignore case** on **Remove duplicates** only
  decides what counts as the same, it does not change the values kept.
- **Patient ids differ between the two copies.** That is expected: **Remove duplicates** keeps the first record of each
  person in the sorted order and drops the other, whatever its `patient_id`.
