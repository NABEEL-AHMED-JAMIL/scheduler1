---
id: ai-assistant
title: Design a pipeline with the AI Assistant
summary: Describe a pipeline in plain words, check the flow it draws, create it; ask about runs, sources and files; what it can and cannot reach.
section: Ask and assist
who: Anyone whose page access includes Prompts › AI Assistant; creating a pipeline and choosing the model are a workspace administrator's
where: Build › AI Assistant (/ai/assistant)
related: ai-models, ai-data-levels, ai-steps, run-runs
popular: Describe a pipeline to the AI Assistant
---
The **AI Assistant** turns a description in plain words into a pipeline you can check, fill in and create, and answers
questions about your runs, sources and files. It uses only the tools in the Tool Registry, acts as you, and asks before it
runs, saves or deletes anything. Nothing it designs is saved until you choose **Create pipeline**.

![The AI Assistant with a drawn flow](ai-assistant "Build › AI Assistant: conversations on the left, the chat in the middle, the drawn flow on the right")

## Design a pipeline in a conversation
1. Open **Build › AI Assistant** and choose **New chat**.
2. Say what should happen to your data, as you would to a colleague, or start from a suggestion under **Design a
   pipeline**.
3. The assistant draws the pipeline on the **Flow** tab, step by step, checked against this workspace's tasks. The flow's
   label says where it stands: **Ready to create**, *N settings to fill*, *Check N warnings* or *N errors*.
4. Select a step on the flow to see what it does and fill its settings. To change the flow, ask in the chat ("also email
   the physicians", "read only yesterday's files"); settings you filled for a step the change keeps stay filled.
5. When the label says **Ready to create**, choose **Create pipeline**. Name it, pick its topic and how it starts, and
   confirm. It is saved in this workspace as you, as the pipeline's first version.
6. Open it with **Open in step builder**, or start it with **Run now** or **Schedule**.

```A description the assistant can draw
Design a pipeline: every night read orders.csv from storage, keep the paid orders, and save them as a CSV.
```

> **Tip:** If the flow changes after you created it, the button becomes **Update pipeline**: it saves the change as a new
> version. **Create pipeline** is not offered again, so the same pipeline is never made twice.

## Ask about runs, sources and files
Questions such as *How did my last run go?*, *Which runs failed this week?* or *List the data sources in this workspace*
are answered at once from what you may open. A question about numbers in a dataset can come back as a chart on the
**Chart** tab; you can pin it to a dashboard if you may edit dashboards. **Tool calls** shows every tool the assistant
used for an answer, and how long each took.

## It asks before it acts
Anything that changes something comes back as a card, **Confirm before it runs**, naming the tool and what it will do,
with a time it expires. Nothing happens until you choose the card's button (**Run pipeline**, **Save file**, **Create PDF**,
**Delete file**) or **Cancel**. The card says it runs as you, in this workspace.

## What it can and cannot reach
The **Context** tab says exactly what applies to you here:

![The assistant's Context tab](ai-assistant-context "Context: the workspace, who it acts as, the model, the data policy and the tools allowed")

- **Workspace** and **Acting as**: it works only in this workspace, as you. It reads only what your own access opens.
- **Model**: the workspace default, unless an administrator picks another connection at the top of the page.
- **Data policy**: for each data level, which models may see it and whether the assistant's write tools may act on it.
  Sensitive data stays on local models, and the write tools do not act on it, unless your administrator changes the policy.
- **Tools allowed** and **Asks first for**: the tools it may use (from **Settings › Tool Registry**) and those that always
  need your confirmation. A blocked tool is listed with the reason.

It cannot reach another workspace, a page your access does not open, or anything outside the tools listed.

> **Note:** A local model can take a minute to plan. **Stop** ends the run on the server; whatever it said before it
> stopped stays in the conversation, and **Retry** asks the same question again.

## Your conversations
The list on the left keeps your conversations, newest first, with whether each made a pipeline (**Pipeline created**,
**Not saved**) or answered a question. Search them, filter by **Pipelines**, **Questions** or **Runs**, rename one, or delete it.

## Example
Summit Valley's administrator asks for a daily SMS reminder: read `clinic/appointments.csv` at 17:00, keep tomorrow's booked
appointments, and send them to the SMS messages API in batches of 100. The assistant draws three steps; once each setting is
filled the label reads **Ready to create**, and **Create pipeline** saves it with its schedule.

## Limits
| What | Limit |
|---|---|
| One message | 4,000 characters |
| Who may create or update a pipeline | A workspace administrator; in a managed workspace you can still ask and draw |
| Who may pick the model | A workspace administrator |
