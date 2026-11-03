---
id: pl-route
title: Send rows down different paths with a Route step
summary: Split rows into named branches by conditions (if / otherwise), give each branch its own steps, and bring them together again with Merge.
section: Build and try
who: Anyone who builds pipelines
where: Build › Pipelines › a pipeline › Steps (/pipelines/list)
related: pl-builder, pl-run-pipeline, step-glance
---
A **Route** step sends each row down one of several named **branches**. You give each branch conditions, built the same
way as a **Filter** step's: a column, what it must be, and a value, with **all** or **any** of them. A row goes down the
first branch whose conditions it meets. Every row that meets none goes down **Otherwise**.

Use it when rows need different work. For example, referrals an AI step marks urgent get a second opinion from an API,
and the rest skip that call. Without a Route you would filter the same rows twice.

![A Route step in the Flow view: the urgent branch and the routine branch side by side, joined again by a Merge step](pl-route "Route: each branch is its own chain of steps, and Merge brings them together")

## Add a Route

1. On the pipeline's **Steps** tab, add **Route (if / otherwise)** from **Add step**.
2. Under **Branches**, add one branch per path, in order: a **name** (lowercase, such as `urgent`) and its
   **conditions**. A row goes down the first branch it meets, so put the narrowest branch first.
3. Name the **Otherwise** branch, or keep `otherwise`. You can have up to 9 branches plus Otherwise.
4. Each row also gets a **branch** column that says where it went. Change the column's name under **Branch column** if
   your rows already have one.

## Give a branch its steps

1. Add the branch's first step. In its panel, set **Reads** to the branch, such as `triage.urgent` (the Route's key, a
   dot, the branch's name).
2. The steps you add after it read the step before them, as usual, so they stay in the same branch.
3. Start the next branch the same way: its first step reads `triage.otherwise` (or your Otherwise name).

The step list sets a branch's steps in and says **Branch urgent of triage** under each. **Flow** draws the branches side
by side. A branch with no steps simply passes its rows on.

## Bring the branches together, or end them separately

- To continue as one line, add **Merge branches** and choose the Route. It stacks every branch's last step, in the
  Route's order, matching columns by name. A column a branch does not have is empty, and the **branch** column says
  where each row came from. The steps after the Merge read its rows.
- To end branches separately, give each its own output step, such as **Save File** or **Upload to bucket**.

## What a run shows

- The Route's line on the run page says how many rows went down each branch, for example **urgent 2 · routine 3**. Each
  branch's rows are also kept as a dataset of the Route step (**branch urgent**), which you can open or download.
- The **Map** draws each branch from the Route, labelled with the branch and its rows.
- If a step inside a branch fails, **Retry from step N** reruns from that step. The Route and the branches'
  rows are reused.

## Things to know

| What | How it works |
| --- | --- |
| Which branch a row takes | The first one whose conditions it meets, else Otherwise |
| An empty value in a condition | Never counts as less or more than anything; use **is_empty** to pick empty rows |
| A branch's name | Lowercase letters, digits and `_`, unique in the Route |
| Branches per Route | 1 to 9, plus Otherwise |
| Rules on AI and API steps | A branch's steps follow the same data policies, billing and retention as any step |
