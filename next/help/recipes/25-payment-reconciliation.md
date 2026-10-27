---
id: rcp-payment-reconciliation
title: Reconcile payments against claims
summary: Join each claim to its remittance, work out what was short paid, denied or never answered, and keep the largest differences for the billing team every morning.
section: Healthcare
who: A workspace administrator builds it (Upload to bucket is an administrator's step)
where: Build › Pipelines (/pipelines/list); Build › Pipelines › Schedules & triggers (/pipelines/schedules)
related: step-combine, step-shape, step-read, step-outputs, trg-schedules
---
Payers answer claims with remittances: paid in full, paid less, or denied with a reason. Some claims get no answer at
all. This recipe joins the day's claims to the remittances that came in since the last run, works out each claim's
difference and status with two formulas, and keeps every claim that was not paid in full, largest first, for the
revenue-cycle team.

> **Note:** The claims and remittances are synthetic; the payers are fictional.

## What you'll build

A pipeline **Payment reconciliation: remittance against claims** of eight steps and a daily schedule at 04:00. It
writes `rcm/recon/<date>.csv` to your bucket and keeps the 50 largest differences as `reconciliation-top.csv` with the
run.

![The pipeline's steps](rcp-x-recon-steps "Summit Valley's reconciliation: claims and remittances read, joined, worked out, filtered and kept")

## What you need first

1. **A storage connection**, *your bucket* (see [Connect your storage](#con-storage)).
2. **The sample files**:
   - [claims.csv](/help/samples/payment-reconciliation/claims.csv): 300 claims, pipe-delimited: `claim_id`, `mrn`,
     `payer`, `cpt`, `service_date`, `billed`.
   - [remits-20261026.csv](/help/samples/payment-reconciliation/remits-20261026.csv): 200 remittances, comma-delimited:
     `claim_id`, `payer`, `status` (`paid` or `denied`), `paid`, `denial_reason`, `remit_date`. The last 100 claims have
     none.
3. **Put them in your bucket** with **See results › Analysis › Files** (see [Files](#dash-files)): `claims.csv` in a
   folder `claims/in/`, and the remittance file in a folder `remits/`.

## Build it

1. **Build › Pipelines › New pipeline**, **Add steps yourself**, **Name** `Payment reconciliation: remittance against
   claims`, **Create and add steps**.
2. Add the steps. Step 3 reads `claims` and joins `remits` to it; step 8 reads `diff`, not the step before it.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read CSV/JSON/Parquet | `claims` | **Bucket** your bucket; **File** `claims/in/claims.csv`; **CSV delimiter** `\|` |
| 2 | Read S3 | `remits` | **Bucket** your bucket; **Prefix** `remits/remits-`; **Read as** `csv`; **Which objects** `last_run` |
| 3 | Join | `joined` | **Reads** `claims`. **Join with** `remits`; **On** `claim_id` = `claim_id`; **Keep** `left`; **Prefix for clashing columns** `remit_` |
| 4 | Compute | `var` | The two formulas below |
| 5 | Filter | `diff` | **Column** `recon_status`, **Is** `ne`, **Value** `paid` |
| 6 | Limit / top N | `top` | **Rows to keep** `50`; **Top N by** `variance`, `desc` |
| 7 | Save File | `keep_top` | **File name** `reconciliation-top.csv` |
| 8 | Upload to bucket | `keep` | **Reads** `diff`. **Bucket** your bucket; **Object key** `rcm/recon/{{date}}.csv`; **Format** `csv` |

The **Compute** formulas, the column then the formula:

```Compute: the difference and the status of each claim
variance     = round(billed - coalesce(paid, 0), 2)
recon_status = if(is_null(status), 'no remittance', if(status == 'denied', 'denied', if(billed - coalesce(paid, 0) > 0, 'short paid', 'paid')))
```

3. **Settings** tab: **Data sensitivity** **Sensitive**. **Validate**, **Save**.
4. **Schedule**: **Schedule name** `Payment reconciliation`, **On a timetable**, **Daily** at `04:00`, **Create schedule**.
   Then **Run now** to try it.

> **Tip:** Only `payer` is in both files, so the join renames the remittance's payer to `remit_payer` and leaves
> `status`, `paid` and `denial_reason` as they are. A formula that names a column the join never made (such as
> `remit_paid`) can give an empty or wrong value without failing the step: check the **Join** step's columns on the run
> before you trust the formulas.

## Check it worked

The first run is **Completed**, 8 of 8 steps:

| Step | Rows in → out |
|---|---|
| Claims | 0 → 300 |
| Remittances since the last run | 0 → 200 |
| Join (left) | 300 → 300 |
| Compute | 300 → 300 |
| Filter: not paid in full | 300 → **172** |
| Limit / top N | 172 → 50 |
| Save File | 50 |
| Upload to bucket | 172 |

Of the 300 claims, 128 are paid in full, 43 short paid, 29 denied and 100 have no remittance. The largest difference,
first in `reconciliation-top.csv`, is claim `CLM-000274`, 2,399.68, with no remittance.

The next run reads only the remittance files written to `remits/` since this run completed, so put the next day's file
(`remits/remits-20261027.csv`, say) there before it.

![The join's settings](rcp-x-recon-join "The Join step: each claim kept, its remittance beside it, the clashing payer column prefixed")

> **Note:** Not yet verified end to end with these formulas. Summit Valley's run (5,000 claims, 2,400 remittances)
> completed, but its formulas named `remit_paid` and `remit_status`, which its join never made, so every claim came out
> **no remittance**; the formulas above name the columns the join really keeps. It also makes a **Reconciliation**
> report from a saved template; to add one, see [Generate report](#step-outputs--generate-report).

## Common mistakes

- **Every claim reads "no remittance".** The remittances were already read by an earlier run: **Which objects**
  `last_run` reads only files written since the schedule's last completed run. Put in a new file, or set it to `all`
  while you test. A failed run moves nothing on, so its files are read again next time.
- **The join matches nothing.** `claims.csv` is pipe-delimited and the remittance file is not: only step 1 sets **CSV
  delimiter** `|`.
- **`variance` is empty.** A formula named a column that is not there. Open the run's **Join** step output and compare
  the column names with the formulas.
- **Paid claims stay in the list.** The Filter compares `recon_status` with `paid`, spelled the same way as in the
  formula.
