---
id: step-shape
title: "Shape steps: choose, clean and work out columns"
summary: Select columns, Filter, Transform, Compute, Fill missing values, Split column, Remove duplicates, Sort and Limit / top N.
section: Read and shape
who: A workspace administrator adds steps
where: Build › Pipelines › a pipeline › Steps › Add step (/pipelines/list)
related: step-read, step-combine, step-glance, pl-builder
---
Shape steps change the rows a step reads: which columns there are, which rows stay, what each value is. They do their
work on the platform itself and call nothing outside it. In the builder they are the **Transform** stage.

![The Filter step's settings](step-shape "Filter: keep a row that meets all of its conditions")

## Select columns

**What it does.** Keeps the columns it names, in that order, optionally renamed.

**Settings.** **Columns**: a list of names to keep, or pairs of old and new names to keep and rename. **Fail on a
missing column** (off): fail the step when the input has no such column; otherwise the column is empty.

**Example.** **Referral intake** keeps patient_name, dob, reason, urgency and referring_npi, with **Fail on a missing
column** on, so a referral missing a field stops the run.

## Filter

**What it does.** Keeps the rows that meet all (or any) of its conditions; the others are dropped.

**Settings.**

- **Keep a row that meets**: `all` or `any` of the conditions.
- **Conditions**: each a **Column**, an **Is** and a **Value** (or **Values** for `in` and `not_in`), with **Ignore
  case**. **Is** is one of `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `starts_with`, `ends_with`, `in`,
  `not_in`, `is_null`, `not_null`, `is_empty`, `not_empty`.

**Example.** **Appointment reminders for tomorrow** keeps the rows whose `is_tomorrow` is true.

**Limits.** 50 conditions; 1,000 values in one `in` list.

## Transform

**What it does.** Makes each row's columns from its old ones by simple operations.

**Settings.** **Mappings**, each a **Column** to make and an **Operation**: `copy` (**From column**), `constant`
(**Value**), `concat` (**From columns** with a **Separator**), `upper`, `lower`, `trim`, `cast` (**Cast to** text,
integer, number or boolean; **Empty when it cannot cast**), `coalesce` (the first of **From columns** with a value, else
**Value**) and `replace` (**Replace** … **With**). **Keep the other columns** (off): pass the input's columns on too;
otherwise only the mapped ones.

**Example.** **Shift roster clean-up** puts wards in upper case, trims roles, casts hours to whole numbers (leaving
the ones that cannot be read empty) and keeps every other column.

## Compute

**What it does.** Adds columns worked out from each row by a formula; a formula may also replace a column.

**Settings.** **Formulas**, each a **Column** and a **Formula**, with **Empty when it cannot be worked out**.

**Formulas.** Arithmetic and comparisons, and the functions `abs`, `ceil`, `coalesce`, `concat`, `date_add(date, amount,
unit)`, `date_diff(from, to, unit)`, `date_trunc(date, unit)`, `days_between`, `floor`, `if(condition, then,
otherwise)`, `is_null`, `json_get(json, path)`, `json_array_length`, `json_keys`, `max`, `min`, `mod`, `number`,
`regex_extract(text, pattern)`, `round(x, places)`, `text` and `today()`. A unit is second, minute, hour, day (the
default), week, month, quarter or year; a date is YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.

```A Compute formula
round(occupied * 100 / beds, 1)
```

**Text in quotes.** Text in a formula goes in quotes: `'Current'`. To put a quote inside it, write it twice:
`'it''s'` is the text *it's*. A run value or parameter placed inside quotes, such as `'{{param.reviewed_by}}'`, is
safe even when it holds a quote (a reviewer named O'Brien): it stays one text and never ends the quotes early.

**Example.** **Bed occupancy by ward** works out `occupancy_pct` with the formula above; **ER waiting times** works out
`wait_min = date_diff(arrived_at, seen_at, minute)`.

**Limits.** 50 formulas a step; a formula is at most 1,000 characters.

## Fill missing values

**What it does.** Fills the empty cells of the columns you name, with a value or with the last value above them.

**Settings.** **Columns to fill**, each a **Column**, **Fill with** `value` (the **Value** below) or `previous` (the
column's last value above; none above stays empty). **Blank text is empty** (on): text of only spaces counts as empty.

**Example.** **ICU vital-sign gaps carried forward** sorts by patient and time, then carries each patient's last heart
rate and oxygen reading forward and writes "unknown" where the device is missing.

**Limits.** 100 columns a step. Sort first: `previous` follows the rows' order.

## Split column

**What it does.** Cuts a text column at a separator, into named columns or into one row per part.

**Settings.** **Column**, **Separator** (`,`), **Into** (`columns` or `rows`), **New columns** (for columns, the parts'
names in order; for rows, one name for the part), **Trim spaces** (on), **Keep the column** (off), **Skip empty parts**
(on).

**Example.** **Shift roster clean-up** splits "Last, First" into `last_name` and `first_name`; **Online orders JSON feed**
splits each order's SKUs into one row per SKU.

**Limits.** 50 new columns.

## Remove duplicates

**What it does.** Keeps one row per key, the first or the last of each, in the input's order.

**Settings.** **Key columns** (empty: rows equal on every column), **Keep** `first` or `last`, **Ignore case** (also
ignores spaces around text).

**Example.** **Duplicate patient records (master index)** keeps one record per last name, first name and date of birth,
ignoring case: 5,000 rows become 4,880.

## Sort

**What it does.** Orders the rows by one or more columns.

**Settings.** **Sort by**: each a **Column**, a **Direction** (`asc` smallest first, `desc` largest first) and **Empty
values** (`last` or `first`). The first column decides; the next breaks ties. Numbers sort as numbers (also when a CSV
holds them as text) before text; ISO dates sort in date order; rows equal on every column keep their order.

**Limits.** Any number of rows. 10 sort columns. Time limit 1,800 seconds.

## Limit / top N

**What it does.** Keeps the first N rows, or the top N by an order, optionally after skipping some.

**Settings.** **Rows to keep** (required), **Skip first** (0; offset 100 and rows 100 is the second hundred), **Top N
by** (empty: the first rows in their order, and the rest is not read; set: the top rows in that order, reading every
row).

**Example.** **30-day readmission watch-list** keeps the 50 patients with the highest risk score.
