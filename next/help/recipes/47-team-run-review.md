---
id: rcp-team-run-review
title: Teams with a lead, and a pipeline's results reviewed by a team
summary: Make the Physicians, Senior physicians and Radiology teams with their leads, then hold an imaging worklist pipeline's results until someone in Radiology approves them, one run at a time.
section: Building blocks
who: A workspace administrator makes teams, names leads and sets the pipeline's review; the team's members decide
where: Administration › Teams (/administration/teams); Build › Pipelines › a pipeline › Settings (/pipelines/list); Run & review › Review › Approvals (/review/approvals)
related: adm-teams, apr-run-review, apr-who-decides, pl-settings, rcp-approval-condition, rcp-signed-report
popular: Have a team review a pipeline's results
---
A **team** lets work go to whoever in it is free. A pipeline's **review** holds each run's results until a person
approves them: the run completes, but reads **Completed · waiting for review** until then. Point the review at a team
and every member sees the task; with **Requires individual review**, each run must be opened and decided on its own,
never in bulk.

## What you'll build

- Three teams: **Physicians** (lead Dr. Anika Patel, members Dr. Minh Nguyen and Dr. Chidi Okafor), **Senior
  physicians** (lead Dr. Chidi Okafor) and **Radiology** (lead Dr. Lena Schmidt). The other recipes use them too.
- A pipeline, **Imaging worklist**, whose results wait for **Radiology**, one run at a time.
- One run, approved by Dr. Schmidt, its status **Completed · approved**.

Summit Valley's *Journey 8 · Chest X-ray triage with radiologist review* is reviewed the same way by its Radiology team;
its review settings are the figure.

## What you need first

- The people, added under **Administration › Users** (see [Add a person](#adm-people)). The list, with fictional
  addresses: [people-and-teams.csv](/help/samples/team-run-review/people-and-teams.csv).
- The sample [imaging-worklist.csv](/help/samples/team-run-review/imaging-worklist.csv): 12 synthetic imaging studies
  (`study_id`, `mrn`, `modality`, `urgency`, `ordered_at`), 3 of them `urgent`. Upload it to the folder `imaging/` of
  your bucket (**See results › Analysis › Files**).

## Build it

### Make the teams

1. Open **Administration › Teams** and choose **New team**. **Name** `Physicians`, **Description** `Attending
   physicians`. **Make team**.
2. In the team's panel, under **Add a person**, choose Dr. Anika Patel, **As** **Lead**, **Add**. Then Dr. Minh Nguyen and
   Dr. Chidi Okafor, each **As** **Member**.
3. **New team** `Senior physicians`: Dr. Chidi Okafor as **Lead**.
4. **New team** `Radiology`: Dr. Lena Schmidt as **Lead**.
5. The tiles now count **3** teams, **4** people in teams and **3** leads.

![A team's panel](rcp-b-teams "The team's panel: about, members with Member or Lead, Add a person, and where the team is used")

A lead adds and removes the team's members from then on; only an administrator names leads, renames or archives a team.

### Find the team's number

The review below names the team by its number. Open **Administration › Users**, open Dr. Lena Schmidt, and under
**Teams** click **Radiology**: the Teams page opens with an address ending `?team=14` (your number differs). Note it.

### The pipeline

1. **Build › Pipelines** → **New pipeline** → **Add steps yourself**, **Name** `Imaging worklist`, **Create and add
   steps**.
2. **Read CSV/JSON/Parquet**: **Key** `list`, **Bucket** your alias, **File** `imaging/imaging-worklist.csv`.
3. **Compute**: **Key** `first`, **Column** `review_first`, **Formula** `if(urgency == 'urgent', true, false)`.
4. **Sort**: **Key** `ordered`, **Sort by** `review_first` `desc`, then `ordered_at` `asc`.
5. **Upload to bucket**: **Key** `keep`, **Object key** `imaging/worklist/{{date}}-{{run}}.csv`, **Format** `csv`.
6. Open the **Settings** tab, section **Review**. Under **Results need review by** tick **Our team**; under
   **Individual review** tick **Requires individual review (never approved or rejected in bulk)**.
7. Open the **YAML** tab. At the end, under `settings:`, the review reads `review:` with `required: [internal]` and
   `individual: true`. Add the two `reviewers` lines, with your team's number:

```The review in the YAML tab
  review:
    required:
    - internal
    reviewers:
      kind: team
      value: '14'
    individual: true
```

8. **Validate**, then **Save**. A team number that is not one of your workspace's active teams is refused.

![A pipeline whose results wait for its team](rcp-b-review-settings "Settings › Review: Our team, and Requires individual review")

> **Tip:** Who is asked, the reminders and the due time for every run review are set once, in **Build › Approval
> workflows › Pipeline run review**. Its approver, *The reviewers named on the request*, is the team you named here.

## Check it worked

1. **Run now** on the pipeline. The run's steps read `0 → 12`, `12 → 12`, `12 → 12`, `12 → 12`, the 3 urgent studies
   first in the file, and its status reads **Completed · waiting for review**.
2. Sign in as Dr. Lena Schmidt. **Review › Approvals** → **My teams** has one task about the run. Open it: **What to
   review** shows the run's first fields and **Open the run**.
3. Choose **Approve**, with a note under **What you checked**, for example `Urgent studies first: checked`.
4. The run's status becomes **Completed · approved**; the task moves to **Done**, under her name.
5. Dr. Minh Nguyen, who is not in Radiology, has no task for it.
6. Start a second run and try to approve it with others in bulk: it is skipped: *Its pipeline requires individual
   review: decide this run on its own.*

## Common mistakes

| What you see | Why, and what to do |
|---|---|
| The task goes to the administrators | No `reviewers` in the YAML, or the team has no members: the review falls back to the administrators. |
| *That team is not in this workspace.* when you save | The number is not an active team of this workspace. Check it from the person's page again. |
| A team with **No lead** | Nobody was added **As** **Lead**: only administrators can then change its members. |
| The lead cannot rename the team | By design: leads change members; administrators name leads, rename and archive. |
| You cannot approve the run | You started it. No one decides their own request: someone else in the team decides. |
| A failed run has no review | Only a completed run has results to decide. |

> **Note:** Not yet verified end to end at Summit Valley: its teams were made without leads (every team there shows
> **No lead**), and the X-ray run's review is waiting to be run in the showcase.
