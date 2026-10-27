---
id: rcp-credential-expiry
title: Staff credentials about to lapse, one notice per person
summary: Work out the days left on every licence and certificate, keep those lapsing within 30 days, write one notice file per person and tell HR.
section: Other industries
who: A workspace administrator builds it; the HR person it names sees the bell notice
where: Build › Pipelines (/pipelines/list); Run & review › Runs (/runs/latest)
related: step-shape, step-outputs, pl-placeholders, trg-schedules, gs-profile
---
Nurses' licences, life-support certificates and registrations all lapse on a date. HR wants to know a month ahead, and
wants one notice per person to send on. This recipe works out the days left on each credential with `today()`, keeps
the ones lapsing within 30 days (or already lapsed), takes the most urgent 25, writes one small JSON notice per
person, and tells the HR lead in the bell. It runs every Monday.

> **Note:** The staff ids and dates are synthetic.

## What you'll build

A pipeline **Credential and licence expiry** of six steps and a weekly schedule on Mondays at 06:00. Each run keeps up
to 25 files named `notice-<staff id>.json`.

![The run's steps](rcp-x-creds-run "Summit Valley's run: 800 credentials, 91 lapsing within 30 days, 25 notices, one bell notice")

## What you need first

1. **A storage connection**, *your bucket* (see [Connect your storage](#con-storage)).
2. The sample file [credentials.csv](/help/samples/credential-expiry/credentials.csv): 200 credentials, `staff_id`,
   `credential`, `expires_on`. 31 lapsed during 2025; the rest lapse in 2031 or later, so the counts below hold for years.
   To see a credential "about to lapse", change one date to next week before you upload the file.
3. Put it in a folder `hr/` of your bucket (**See results › Analysis › Files**, see [Files](#dash-files)).
4. **The HR person** to tell: anyone in the workspace (Summit Valley tells Owen Wright).

## Build it

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Credential and licence expiry`, **Create and
   add steps**.
2. Add:

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `creds` | **Bucket** your bucket; **File** `hr/credentials.csv` |
| 2 | Compute | `left` | **Column** `days_left`, **Formula** `days_between(today(), expires_on)` |
| 3 | Filter | `soon` | **Column** `days_left`, **Is** `lte`, **Value** `30` |
| 4 | Limit / top N | `first` | **Rows to keep** `25`; **Top N by** `days_left` `asc` |
| 5 | Save File | `notices` | **File name** `notice-{{staff_id}}.json`; **Format** `json`; **One file per row** on; **At most files** `25` |
| 6 | Send Notification | `tell` | **Title** `Credentials expiring: {{rows}}`; **Message** `Notices are kept with the run.`; **Severity** `WARNING`; **To** `users`, **People** the HR person; **Send** `has_rows` |

3. **Settings**: **Data sensitivity** **Internal**. **Validate**, **Save**.
4. **Schedule**: **On a timetable**, **Weekly**, every 1 week at `06:00` **On these days** Mon. **Create schedule**, then
   **Run now**.

## Check it worked

The run is **Completed**, 6 of 6 steps:

| Step | Rows in → out |
|---|---|
| Credentials | 0 → 200 |
| Compute | 200 → 200 |
| Filter: 30 days or fewer | 200 → **31** (a lapsed credential has fewer than 0 days) |
| Limit / top N | 31 → **25** |
| Save File | 25 rows, 25 files |
| Send Notification | 25 |

The **Outputs** tab lists 25 files, one per person; `notice-E00017.json` is the credential that lapsed longest ago. Each
holds one row: `staff_id`, `credential`, `expires_on` and `days_left`. The HR person's bell shows **Credentials expiring: 25**.

Summit Valley's run read 800 credentials; 91 lapse within 30 days, and the first 25 notices went with the bell notice
to Owen Wright.

## Common mistakes

- **`days_left` is empty.** `expires_on` must be a date as `2026-11-30`; another format cannot be worked out.
- **The lapsed ones are missing.** Use **Is** `lte` with `30`: a lapsed credential has a negative number of days, which
  is also 30 or fewer. A filter "between 0 and 30" would leave them out.
- **The files are named `notice-.json`.** The column in the name is written `{{staff_id}}`, exactly as the file's
  header spells it, and **One file per row** is on.
- **The run makes 25 notices every week for the same people.** That is the list as it stands each Monday. Once a
  credential is renewed, update its date at the source and it drops out.
