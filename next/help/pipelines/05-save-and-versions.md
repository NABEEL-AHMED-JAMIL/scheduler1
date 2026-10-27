---
id: pl-versions
title: Save, versions and history
summary: What a save makes, the version history, which version a run uses, and how to go back to an earlier design.
section: Save and settings
who: A workspace administrator saves; anyone who can open the pipeline sees its history
where: Build › Pipelines › a pipeline › History (/pipelines/list)
related: pl-builder, pl-try, pl-settings, pl-start, run-schedule-items
---
Every save of a pipeline's steps makes a new **version**. A run uses the version that was current when it started, so
you can change a pipeline while it runs, and every run can later be traced to the steps it used.

## Save the pipeline

1. Make your changes on any tab: **Details**, **Steps**, **Settings**, **YAML** or **JSON**.
2. The save bar at the foot of the page says whether there are unsaved changes. **Discard** puts everything back as
   saved; **Validate** checks the draft first (see [Try a pipeline](#pl-try--check-the-pipeline)).
3. Choose **Save**. The platform checks the definition again; when it is valid, the steps are saved as the next version
   and the version pill beside the pipeline's name (**v3**, for example) moves on.
4. If the save is refused, the problems are shown on their steps, as **Validate** shows them, and nothing is saved.

> **Note:** A pipeline made before steps existed runs as its **legacy** step: its payload, sent to the worker that reads
> its topic. Adding a step replaces it, and once saved every schedule of that pipeline runs the steps instead.

## Read the version history

1. Open the pipeline's **History** tab.
2. **Versions** lists each saved version with when it was **Saved** and **By** whom. The current one is marked
   **Current**.

![The version history of a pipeline](pl-history "History: each save of the steps is a version")

## Go back to an earlier design

The **History** tab lists the versions; it does not compare two of them side by side or restore an older one with a
button. To undo a change:

1. Before you save, choose **Discard** in the save bar to drop unsaved changes.
2. After you save, change the steps back (on the **Steps** tab, or paste the earlier definition you kept from the
   **YAML** tab) and save again. The result is a new version with the earlier design.

> **Tip:** Before a large change, copy the **YAML** tab's text somewhere safe. It is the whole definition, and pasting
> it back and saving restores it exactly.

To see what changed between two runs, open the schedule's **Items** tab and tick two runs to compare them (see [a schedule's items](#run-schedule-items)): the
comparison shows each step's differences and what changed in the pipeline between them.

## Example

Summit Valley's **Journey 7 · Wound photo** has three versions, v1 to v3, each saved by the workspace administrator
within a few minutes while the pipeline was built. Its schedule's runs from before the last save still name the version
they ran, so a wound report made by v2 can be told apart from one made by v3.

## Limits

| What | Limit |
|---|---|
| Versions kept | Every saved version |
| Who saves | A workspace administrator; in a workspace our team manages, the pipeline is read-only to you |
