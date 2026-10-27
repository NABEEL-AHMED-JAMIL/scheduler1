---
id: pl-builder
title: The step builder
summary: Add, move and remove steps; each step's settings panel; the flow map and folding stages; the YAML and JSON views.
section: Build and try
who: A workspace administrator; some steps (Call API, Read runs, Run pipeline, Send webhook, Upload to bucket) only an administrator may add
where: Build › Pipelines › a pipeline › Steps (/pipelines/list)
related: pl-start, pl-try, pl-versions, pl-settings, step-glance
---
The step builder is where a pipeline's steps are put in order and set up. Open a pipeline from **Build › Pipelines**:
its page shows the pipeline's name, status and version, **Schedule** and **Run now** at the top, an overview strip, and
the tabs **Details**, **Steps**, **Settings**, **Schedules**, **History**, **YAML** and **JSON**.

The overview strip reads left to right in the order a pipeline is set up: **Source**, **Steps**, **Review**,
**Outputs** and **Schedule & triggers**. Each part says **Set**, **Optional** or what is missing ("Add a Write step: a
file, a bucket, a PDF or a webhook"); click a part to go where it is set.

![The step builder with the steps grouped by stage](pl-builder "A pipeline's Steps tab: the overview strip, the steps in stages, Test with sample and Add step")

## Add a step

1. Open the pipeline's **Steps** tab.
2. Click **Add step from the Task Registry…** and type part of a step's name, such as "filter" or "report". The steps
   are grouped as **Read**, **Process** and **Output**; one marked **(disabled)** cannot be added here, and its hint says
   why.
3. Pick the step. It is added at the end and its settings panel opens.
4. Fill in the settings and choose **Apply**. The step is in the draft; nothing is saved yet.

> **Tip:** Which steps **Add step** offers is set for the whole workspace in **Settings › Task Registry**, not per
> pipeline.

## Fill in a step's settings panel

Click a step's name (or its pencil) to open its panel on the right.

1. **Key**: lower case letters, digits and _. It names the step's rows and is what a later step's **Reads** chooses.
2. **Name**: what the run's timeline calls the step. Blank: its key.
3. **Reads**: **The latest output before this step**, or an earlier step by its key.
4. **Task settings**: the step's own settings, as a form. **Edit as JSON** shows the same settings as text; **Edit as
   form** goes back. Each step's settings are described in the Step reference, for example [the Read steps](#step-read).
5. **How it runs**: **Tries** (1 means no retry), **Seconds between tries**, **Timeout (seconds)** and **If it fails**
   (**Fail the run**, **Continue with the next step** or **Skip the rest and complete**). Blank fields take the step's
   own defaults and then the pipeline's [run defaults](#pl-settings--run-defaults).
6. Choose **Apply** to keep the changes in the draft, or **Cancel**.

![A step's settings panel](pl-step-panel "The Measure image step's panel: key, name, what it reads and its task settings")

## Move or remove a step

- Drag a step by its handle, or focus the handle and press the up and down arrow keys.
- Or use the step's **up** and **down** arrows.
- The bin removes the step from the draft.

After a move, problems found earlier are cleared: choose **Validate** again to see what is still wrong.

## The flow map

Choose **Flow** (beside **List**) to see the steps as a map: each step a box with its first settings, the arrows where
its rows really come from (the step before, the step it reads, a join's other side), the run's start before it.

- Click a box to open that step's panel.
- A step with problems is marked red; a step not saved yet is dashed.
- The arrows beside the stage buttons draw the map **top to bottom** or **left to right**; the zoom buttons fit and
  enlarge it.

### Fold the stages

A pipeline of more than 12 steps opens with its stages folded: each run of steps of one stage is one box, such as
"Transform · 3 steps".

1. Click a stage button (for example **Transform 3–5**) to open or fold that stage.
2. **Collapse all** folds every stage; **Expand all** opens them.
3. Clicking a folded box opens it.

The builder remembers in your browser whether you last chose **List** or **Flow**.

![The flow map with folded stages](pl-flow "A 20-step pipeline in the Flow view, its stages folded")

## The YAML and JSON views

The **YAML** and **JSON** tabs show the same definition as the builder, as text: its steps with their keys, tasks,
settings and how they run, its run parameters and its settings.

1. Open **YAML** (or **JSON**) to read or copy the whole definition.
2. You may edit the text. **Validate** and **Save** read it; leaving the tab applies it to the builder.
3. If the JSON is not valid, the builder keeps the steps it had and says why.

![The definition as YAML](pl-yaml "The YAML tab: the same definition as the builder")

## Example

Summit Valley's **Journey 7 · Wound photo** pipeline has 11 steps in five stages: read the photo the run was started
for, take the MRN from the file name, measure the wound against the ruler, ask the vision model for a DRAFT
description, join the patient's last visit, work out the change in area, keep the result, wait for the wound-care team's
approval, and make one report per photo.

## Limits

| What | Limit |
|---|---|
| Steps in a pipeline | 50 |
| Tries for one step | 1 to 10 |
| Seconds between tries | 0 to 3,600 |
| A step's timeout | 1 to 86,400 seconds |
