---
title: Building pipelines
chapter: 5
part: Part III · Build
icon: layers
blurb: What a pipeline is, three ways to start one, the builder, trying it out, versions and settings.
paths: /pipelines/list, /pipelines/new, /ai/assistant
sections: Basics | Build and try | Save and settings
---
A pipeline is one unit of work your workspace does again and again: steps in order that read your data, check and
shape it, ask a model where it helps, wait for a person where one must decide, and send the results where they are
needed. This chapter shows how to start one, put its steps together in the builder, try it on sample rows, save it as
versions and set what applies to all its steps.

## Start here
1. [Learn what a pipeline is](#pl-overview) — Steps in order, a run, and what a run leaves behind. ![](pl-list)
2. [Start a pipeline](#pl-start) — Describe it to the AI Assistant, add steps yourself, or copy one. ![](pl-new)
3. [Put the steps together](#pl-builder) — Add, move and fill in steps; see them as a flow. ![](pl-builder)
4. [Try it on sample rows](#pl-try) — Test with sample, Validate, then run it once. ![](pl-sample)
5. [Set what applies to every step](#pl-settings) — Review, sensitivity, tags, retention and defaults. ![](pl-settings)
6. [Save it and read its history](#pl-versions) — Each save is a version; a run keeps the one it started with. ![](pl-history)

## Questions
### Why can't I edit a pipeline?
Building and changing pipelines is a workspace administrator's work, and in a workspace our team manages the pipelines
are read-only to you. Anyone whose page access includes Pipelines can still see them. See [What a pipeline is](#pl-overview).

### Does saving a change affect a run that is going?
No. A run uses the version of the steps that was current when it started; your save is the next version, used by the
next run. See [Save, versions and history](#pl-versions).

### How do I put today's date in a file name?
Write `{{date}}` in the step's file name or key, such as `ops/beds/census-{{date}}.csv`. See
[Placeholders and run parameters](#pl-placeholders).

### What is the difference between Duplicate and Copy an existing pipeline?
**Copy an existing pipeline** (under **New pipeline**) makes a pipeline with its own copy of the steps. **Duplicate** in
the list keeps using the original's steps, so a change to one changes both. See [Three ways to start](#pl-start--copy-an-existing-pipeline).

### Can I try a pipeline without real data?
Yes: **Test with sample** puts rows you write first, **Validate** checks the whole definition, and **Save & run now**
shows each step's result. See [Try a pipeline](#pl-try).

### How do I make results wait for a person?
Tick **Our team** under **Results need review by** on the **Settings** tab, or add an **Approval** step where the run
should pause. See [Pipeline settings](#pl-settings--review-whether-a-person-approves-the-results).

### Can a pipeline use another pipeline's answer?
Yes, with a **Run pipeline** step, once or once per row, up to three calls deep. See
[Call another pipeline](#pl-run-pipeline).

## Related
- steps
- triggers
- ai
- runs
- approvals
