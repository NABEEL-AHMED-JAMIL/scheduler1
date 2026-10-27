---
id: ai-costs
title: What AI costs
summary: Tokens, minutes of audio and pages read, where each shows in Cost & usage, and how to keep AI spending in hand.
section: AI at work
who: Workspace administrators read Cost & usage and set the model connections' caps
where: Administration & billing › Billing › Cost & usage (/billing/usage); Administration & billing › Settings › Model connections (/settings/model-connections)
related: ai-models, ai-steps, ai-transcription, ai-prompts
---
AI work is metered as it happens and priced from the workspace's rate card, like everything else the workspace uses.
**Cost & usage** shows the month as the invoice will read it; the AI lines are among the others.

## What is counted
| What | Counted as | When |
|---|---|---|
| Asking a model (prompts, AI steps, the AI Assistant, Ask your data, the file chat, Try it) | **Model tokens in** and **Model tokens out** | Every call, a try included |
| Transcription | Minutes of audio | Each recording transcribed, by a pipeline or on the tool page |
| Reading scanned pages | Pages read | Each page a Read text from pages step reads |
| Converting documents | **Documents converted** | Each file converted |

A run's own page has **What this run cost** (for administrators), and the run's summary shows its **Cost**.

![Line by line in Cost & usage](ai-costs "Cost & usage › Line by line: Model tokens in and out at the top, each line with its rate and amount")

## Read the AI lines
1. Open **Administration & billing › Billing › Cost & usage** and pick the month.
2. **By service** shows **Model calls** beside storage, pipelines, analytics and the API.
3. **AI model calls** lists the month's calls by what called the model (a prompt by name, the assistant, a pipeline), or
   every call.
4. **Cost by pipeline** shows which pipelines spend the most; pick one for its runs.
5. In **Line by line**, click a line for what is behind it, such as which prompt.

## Keep it in hand
- Set a **Daily token budget** on a model connection: once the day's runs reach it, steps fail before any call is made.
- Keep **Calls in flight** and an AI step's **Calls at once** low on shared or local models.
- Use **At most rows** on an AI step, and filter rows before the step, so a large file is never sent row by row by mistake.
- Send only the columns a prompt needs, and cap the answer with **Max tokens**.
- Retry a failed run from the step that failed: the steps before it are reused, not run again. **Run again from the start**
  runs every step again, and its work is billed again. Retry failed items retries only the items that failed.

> **Tip:** On a local model the tokens are still counted, so you can see which prompts do the most work before you move any of
> them to a hosted model.

## Example
In October, Summit Valley's month to date was mostly **Model calls**: about 1.6 million tokens in and 21,000 out across
22 prompts on *Local Ollama*. **AI model calls** shows which prompts those tokens went to.

## Limits
| What | Limit |
|---|---|
| Who reads Cost & usage | A workspace administrator |
| Prices | The workspace's rate card for the month; an issued invoice keeps the rate card that priced it |
