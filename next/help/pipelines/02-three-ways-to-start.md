---
id: pl-start
title: Three ways to start a pipeline
summary: Describe it to the AI Assistant, add the steps yourself, or copy an existing pipeline.
section: Basics
who: A workspace administrator (New pipeline); the AI Assistant needs it in your page access
where: Build › Pipelines › New pipeline (/pipelines/new); Build › AI Assistant (/ai/assistant)
related: pl-overview, pl-builder, pl-try, pl-versions, ai-assistant
popular: Start a new pipeline
---
**New pipeline** offers three starting points side by side. Whichever you choose, you end in the same step builder,
and nothing runs until a schedule or **Run now** starts it. A schedule, triggers and a review come after the pipeline is
made.

![The three ways to start a new pipeline](pl-new "New pipeline: describe it to the AI Assistant, add steps yourself, or copy an existing pipeline")

## Describe it to the AI Assistant

Use this when you know what the pipeline should do but not which steps make it.

1. Open **Build › Pipelines** and choose **New pipeline**.
2. Under **Describe it to the AI Assistant**, write in **What should it do?** what to read, what to work out and where
   the results go, for example: "Every night read the new lab result files, keep the abnormal results, save them and tell
   the physicians."
3. Choose **Open the AI Assistant**. The assistant drafts the steps and draws them as a flow beside the chat.
4. Select a step in the flow to see what it does and fill in its settings. Ask in the chat to change the flow; the
   drawing changes with it.
5. Choose **Create pipeline**. Check the **Name**, the **Pipeline id** (upper case, digits and _, unique in the
   workspace) and when it **Starts**. Tick **Create without schedule: it runs only when you press Run now** if you do not
   want the timetable the assistant proposed yet.
6. Choose **Create pipeline** in the dialog. Afterwards the flow offers **Run now**, **Schedule** and **Open in step
   builder**.

> **Note:** Nothing is saved until you press **Create pipeline**. If you change the flow afterwards, the button reads
> **Update pipeline** and saves the change as a new version; it never makes a second pipeline.

> **Tip:** The AI chapter says more: [Design a pipeline with the AI Assistant](#ai-assistant).

> **Warning:** The assistant's design is a draft. Check every step and its settings before you run it on real data.

## Add steps yourself

Use this when you know the steps, or want to start from sample rows.

1. In **New pipeline**, under **Add steps yourself**, type a **Name** (for example "Readmission risk (daily)").
2. Leave **Advanced: event source** as it is unless an older system starts this pipeline with a message.
3. Choose **Create and add steps**. The pipeline opens on its **Steps** tab, empty. See
   [the builder](#pl-builder) and [Test with sample](#pl-try).

## Copy an existing pipeline

Use this to make a variant of a pipeline that already works.

1. In **New pipeline**, under **Copy an existing pipeline**, choose the **Pipeline to copy**.
2. Change **Name of the copy** (it starts as the original's name with "(copy)").
3. Choose **Copy it**. The steps are copied into a pipeline of its own, so a change to one never changes the other.
4. The copy starts **Inactive**. Change what you need, save, then set its **Status** to **Active** on the **Details** tab.

> **Warning:** **Duplicate** in a pipeline's **⋮** menu on the list is not the same: the duplicate keeps using the
> original's steps, so saving steps in one changes both. For an independent copy, use **Copy an existing pipeline**.

## Example

Summit Valley's analyst copies **Bed occupancy by ward** as "Bed occupancy by ward (ICU only)", adds a **Filter** step
for the ICU wards and a tag on the **Settings** tab, and saves. The original pipeline and its 06:00 schedule are not
touched.

## Limits

| What | Limit |
|---|---|
| A pipeline's name | 120 characters |
| What should it do? | 4,000 characters |
| Who may start one | A workspace administrator; a platform administrator first opens the workspace |
