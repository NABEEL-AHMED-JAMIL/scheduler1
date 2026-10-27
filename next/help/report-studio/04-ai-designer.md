---
id: rs-ai-designer
title: The AI designer
summary: Draft a template from words, suggest mappings and charts, explain the checks, write a paragraph; accept or dismiss.
section: Design
who: Anyone who may edit the template's draft; the workspace needs an active model connection
where: Reports › Templates (/reports/templates)
related: rs-designer, ai-models, ai-costs
---
In a draft's designer, the right-hand pane has an **AI assistant** that proposes changes to the template. It never
saves, publishes or sends anything itself: every proposal is shown first, as a list of changes and on the page, and
is applied only when you choose **Accept**. **Undo** takes an accepted change back.

![The AI assistant in the designer](rs-ai-panel "The AI assistant: its five actions, the words you give it and a proposal to accept or dismiss")

## What it can do

| Action | What you get |
|---|---|
| **Draft the template** | Describe the report in plain words (its sections, values, tables and charts); the draft replaces the page body, the header and footer stay |
| **Suggest mappings** | For each field the template reads that the test data does not have, the data's matching field, with how sure the AI is |
| **Suggest charts** | One to three charts chosen by the test data's field types, added before the footer |
| **Explain the checks** | The checks' problems in plain words, with a fix to apply where one reads a field the data has |
| **Write a paragraph** | A short paragraph of the data's own values, placed after the selected block and labelled "Drafted with AI" |

## Use it
1. Open the draft in the designer and add test data ([Data and test samples](#rs-data)); mappings and charts need it.
2. In **AI assistant**, choose an action, write what you want **In plain words** where it asks, and choose the action's
   button. A local model can take a minute; **Stop waiting** gives up.
3. Read the proposal: what is **Added**, **Changed** and **Removed**, the mappings with how sure each is (hover a row
   for why), and the notes from the checks. **Show on the page** draws it on the page with the new blocks outlined;
   nothing in the draft changes yet.
4. Choose **Accept** to apply it (it is saved at once), or **Dismiss**. **Earlier proposals** keeps the list.

> **Privacy:** Only the test data's field names and types are sent to the model, unless you tick **Include sample
> values** (at most 20 records, identifying values masked) for **Write a paragraph**. The proposal says what was sent
> and which model answered. Which models may see which data is set in **Administration › Data policies**
> ([Which models may see which data](#ai-data-levels)).

> **Warning:** A proposal is refused once the draft was saved after it was made ("The draft was saved since this was
> proposed"): ask again. A paragraph states only the data's own values; read it before you publish, as you would any
> text.

## Good to know
- The assistant uses the workspace's model connection; when none is active the pane says **Not available here now**.
- Its calls count as AI usage in **Billing › Cost & usage** ([What AI costs](#ai-costs)).
- It is offered on drafts only: a published version opens read only.
