---
id: rcp-controlled-substance-counts
title: Reconcile controlled-substance cabinet counts
summary: Compare each cabinet's counted stock with its start count less what was dispensed, and stop the run until a person approves the differences.
section: Healthcare
who: A workspace administrator builds it; the reviewers the Approval step names decide in Review › Approvals
where: Build › Pipelines (/pipelines/list); Run & review › Review › Approvals (/review/approvals)
related: step-people, apr-approval-steps, step-combine, step-shape, trg-schedules
---
Every night the pharmacy counts the controlled substances in each ward cabinet. What should be there is the start count
less what nurses took out, as the dispense log records it. This recipe works that out for every cabinet and item,
keeps the counts that do not match, and pauses the run with an **Approval** step until a person has looked at them.
Nothing is changed in any system: the pipeline only reads three files and asks for a decision.

> **Note:** The cabinets, items and quantities are synthetic, for demonstration only.

## What you'll build

A pipeline **Controlled substance count reconciliation** of ten steps and a daily schedule at 22:00. When counts
differ, its last step waits in **Review › Approvals** with the title "Controlled substance counts: 3 differences".

![The run, approved](rcp-x-cab-run "Summit Valley's run: three files read, two joins, the differences filtered, and the approval decided by pharmacist Avi Cohen")

## What you need first

1. **A storage connection**, *your bucket* (see [Connect your storage](#con-storage)).
2. **The sample files**, put in a folder `ops/pharmacy/` of your bucket with **See results › Analysis › Files** (see
   [Files](#dash-files)):
   - [cabinet-start.csv](/help/samples/controlled-substance-counts/cabinet-start.csv): 24 rows, `cabinet`, `item_id`,
     `start_count` (two cabinets, twelve items, 40 of each).
   - [dispense-log.csv](/help/samples/controlled-substance-counts/dispense-log.csv): 150 dispenses, `dispense_id`,
     `cabinet`, `item_id`, `qty`, `by`.
   - [cabinet-counts.csv](/help/samples/controlled-substance-counts/cabinet-counts.csv): tonight's count, `cabinet`,
     `item_id`, `counted`. Three counts are short.
3. **Who decides.** This recipe asks the workspace's administrators. To ask a team instead, see the last common
   mistake.

## Build it

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Controlled substance count reconciliation`,
   **Create and add steps**.
2. Add the ten steps. Watch the **Reads** of steps 4 and 5: they do not read the step just before them.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `counts` | **Bucket** your bucket; **File** `ops/pharmacy/cabinet-counts.csv` |
| 2 | Read CSV/JSON/Parquet | `start` | **Bucket** your bucket; **File** `ops/pharmacy/cabinet-start.csv` |
| 3 | Read CSV/JSON/Parquet | `log` | **Bucket** your bucket; **File** `ops/pharmacy/dispense-log.csv` |
| 4 | Aggregate | `used` | **Reads** `log`. **Group by** `cabinet`, `item_id`; **Aggregations** `sum` of `qty` as `dispensed` |
| 5 | Join | `exp` | **Reads** `start`. **Join with** `used`; **On** `cabinet` = `cabinet` and `item_id` = `item_id`; **Keep** `left` |
| 6 | Join | `vs` | **Join with** `counts`; **On** the same two pairs; **Keep** `inner` |
| 7 | Compute | `diff` | **Column** `diff`, **Formula** below |
| 8 | Filter | `off` | **Column** `diff`, **Is** `ne`, **Value** `0` |
| 9 | Limit / top N | `first` | **Rows to keep** `50` |
| 10 | Approval | `approve` | The settings below |

```The Compute formula: counted against expected
counted - (start_count - coalesce(dispensed, 0))
```

The **Approval** step:

- **Task title** `Controlled substance counts: {{rows}} differences`
- **What to check** `Count the cabinets again where the difference is not 0, and record what you found.`
- **Fields**: `Differences` = `{{rows}}`
- **Reviewers**: **Reviewers are** `role`, **Role or team** `TENANT_ADMIN` (the workspace's administrators)
- **Decide within (hours)** `12`

3. **Settings**: **Data sensitivity** **Internal**. **Validate**, **Save**.
4. **Schedule**: **On a timetable**, **Daily** at `22:00`, **Create schedule**. **Run now** to try it.

## Check it worked

1. The run stops at step 10: its status reads **Running · waiting for approval**. Steps 1 to 9 read: counts 24, start 24, log 150, `used` 150 → 20
   (the cabinet and item pairs that were dispensed), `exp` 24, `vs` 24, `diff` 24, `off` 24 → **3**, `first` 3.
2. **Run & review › Review › Approvals** shows the task "Controlled substance counts: 3 differences". Open it: the three
   rows are `CAB-1` `F0003` (−2), `CAB-2` `F0007` (−2) and `CAB-2` `F0011` (−1).
3. Approve it (see [Approval steps inside a run](#apr-approval-steps)). The run goes on and is **Completed**, 10 of 10
   steps, the approval line naming who approved and when.
4. Reject it instead, with a reason, and the run fails naming the reason: a count nobody signs off never passes quietly.

Summit Valley's own run read 600 counts and 4,000 dispenses; 588 counts differed (its synthetic start counts are all
40), the first 50 went to the Pharmacy team, and pharmacist Avi Cohen approved them.

> **Note:** Not yet verified end to end with these sample files and the administrators as reviewers. Summit Valley's
> run sent the step to its Pharmacy team.

## Common mistakes

- **Every count is a difference.** Step 5 must read `start` and join `used` to it; if it reads `used`, items never
  dispensed are missing and the rest are off. `coalesce(dispensed, 0)` covers an item nobody took.
- **The join keeps no rows.** Both pairs (`cabinet` and `item_id`) are needed in **On**, on both joins; the values must
  be written the same way in all three files (`CAB-1`, not `Cab 1`).
- **No task appears.** Nobody in the role you named exists, or you are not one of them. Leave **Reviewers** empty to
  ask the workspace's administrators.
- **You want a team, such as Pharmacy, to decide.** Set **Reviewers are** `team` and type the team's id in **Role or
  team**. The Teams page does not show a team's id: ask your account team for it, or leave the step to the
  administrators.
