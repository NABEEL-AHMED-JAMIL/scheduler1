---
title: Glossary and reference
chapter: 20
part: Part VIII · Reference
icon: text
blurb: The words the console uses, the menu, schedule frequencies, roles and run statuses.
paths: 
sections: Glossary | Reference
---
The words the ETL Console uses, in plain words from A to Z, and the facts people look up: the menu, the ways a schedule
repeats, what each role may do, and what a run's status means.

## Start here
1. [Look up a word](#gl-glossary) — About a hundred terms, each with where to read more.
2. [Find a page in the menu](#gl-reference) — The menu as it is for you, group by group. ![](gl-menu)
3. [Pick how often a schedule runs](#gl-reference) — Minutes to cron, and what each needs. ![](gl-frequencies)
4. [Read a run's status](#gl-reference) — Every status, and what waits for a person.

## Questions
### What is the difference between a pipeline, a schedule and a run?
A pipeline is what is done, a schedule is when it is done, and a run is one time it was done. See the
[Glossary](#gl-glossary).

### What do Skip and Missed mean?
**Skip**: passed over on purpose, or because the last run was still going. **Missed**: its time passed while nothing
was running to take it. See [Run statuses](#gl-reference--run-statuses).

### Why does the run's page say "Queued" when the list says "Queue"?
They are the same status: lists show the short word, the run's page the full one. See
[Run statuses](#gl-reference--run-statuses).

### In which time zone does a cron expression run?
In server time, Chicago. See [Schedule frequencies](#gl-reference--schedule-frequencies).

### What can a workspace member do that a viewer cannot?
Both are workspace members; what each may open is their page access profile. See [Roles](#gl-reference--roles).

## Related
- getting-started
- troubleshooting
- administration
- runs
