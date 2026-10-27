---
id: ai-models
title: Your models: model connections
summary: Where prompts run, which model does what, local models, the two caps, and why every answer is a DRAFT.
section: Models and prompts
who: Workspace administrators add, change and test connections; everyone else uses them through prompts, AI steps and the AI Assistant
where: Administration & billing › Settings › Model connections (/settings/model-connections)
related: ai-prompts, ai-data-levels, ai-costs, ai-steps
popular: Connect a model
---
Every AI feature in the console runs on a **model connection**: a provider, its key, a default model and two caps. Prompts,
AI steps in pipelines, image descriptions, the AI Assistant, Ask your data and the reading of documents all go through one.
One connection is the workspace **default**; a prompt that names no connection runs on it.

A model's answer is always a **DRAFT for a person to check**. The console marks it so where a pipeline says so, holds it for
review where the pipeline asks for a review, and never treats it as a decision. A clinician, an analyst or a reviewer decides.

![Model connections, the workspace's local connection selected](ai-model-connections "Model connections: the list on the left; the selected connection's last test, caps, models and the last 30 days of runs")

## Add a connection
1. Open **Administration & billing › Settings › Model connections** and choose **New connection**.
2. Give it a **Name** people will recognise, such as *Local Ollama* or *OpenAI · production*.
3. Pick the **Provider**: OpenAI, Anthropic, Ollama (local), Azure OpenAI, or an OpenAI-compatible server (Groq, vLLM,
   LM Studio and others).
4. Fill **API endpoint** only where the provider needs one (Azure OpenAI and OpenAI-compatible servers); the others have it
   built in. Paste the **API key** for a hosted provider. A local Ollama connection needs no key.
5. Type the **Default model**: what a prompt runs on unless it names another model.
6. Set the two caps (see below) and save.
7. Choose **Test connection**. A passing test lists the models the provider offers and confirms the key; the result shows
   under **Last test**.

> **Privacy:** A key is encrypted when it is stored and is never sent back to the browser. To change it, edit the connection
> and paste a new key; leaving the field blank keeps the stored one.

## The two caps
- **Calls in flight**: at most this many calls at once through this connection (1 to 64); the rest wait in order.
- **Daily token budget**: once the day's runs reach it, a step fails before any call is made. Blank means no cap. The
  connection's page shows how much of today's budget is used.

> **Tip:** On a local model, keep **Calls in flight** low. A small machine answers one question at a time well and several
> slowly. The showcase's *Local Ollama* connection allows one call in flight.

## Which model does what
- A prompt names its **Connection** and, if it wants, a **Model** (see [Write and test a prompt](#ai-prompts)). Blank uses
  the workspace default and that connection's default model.
- Text work (classify, extract, summarise) runs on a text model; describing an image needs a vision model, named on the
  prompt. In the showcase, text prompts run on `qwen3:8b` and the image prompts name `gemma3:4b`.
- The AI Assistant runs on the workspace default unless an administrator picks another connection at the top of its page.
- Which models may see a given kind of data is the workspace's data policy:
  see [Which models may see which data](#ai-data-levels).

## Local models
An **Ollama (local)** connection runs models on machines your organisation runs itself, so the data never goes to a hosted
provider. The **Sensitive** data level starts as *Local only*: until an administrator changes it, only local connections
may see sensitive data.

## Make a connection inactive, or the default
- **Make inactive** stops everything that runs on the connection: the AI Assistant, Ask your data, document reading,
  pipeline AI steps, image description and prompts are refused until it is made active again. If it is the default,
  everything that runs on the default is refused too.
- The **⋮** menu holds **Edit connection**, **Set as default** and **Delete connection**.
- The page shows who last made it active or inactive, and when.

## What the page tells you
| Part | What it shows |
|---|---|
| Last test | Passed, failed or never tested, with the provider's message in words |
| Endpoint | Where calls go, and whether a key is stored |
| Caps | Calls in flight, and today's tokens against the budget |
| Models | The default model and what the provider listed at the last test |
| Usage · last 30 days | Runs, tokens in and out, and the prompts that run on it |
| Recent runs | Each call: when, which prompt, model, status, time and tokens; a failure in plain words, with **Details** |

## Example
Summit Valley Health System runs only local models. Its administrator added *Local Ollama* (Ollama (local), default model
`qwen3:8b`, one call in flight, no daily budget) and set it as the default. Twenty-two prompts run on it, from *Referral
urgency* to *Discharge summary (DRAFT)*; every clinical prompt says DRAFT in its name.

## Limits
| What | Limit |
|---|---|
| Calls in flight | 1 to 64 per connection (default 4) |
| Who may add, change, test or delete | A workspace administrator |
| A connection belongs to | One workspace; only its prompts run on it |
