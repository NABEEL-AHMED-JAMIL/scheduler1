---
title: AI in the console
chapter: 8
part: Part III · Build
icon: sparkle
blurb: Model connections, prompts, AI steps, transcription, the AI Assistant and Ask your data.
paths: /ai/assistant, /pipelines/prompts, /settings/model-connections
sections: Models and prompts | AI at work | Ask and assist
---
AI in the console helps people do their work faster, and never decides for them. Model connections say where models run
(local models by default for sensitive data), prompts say what a step asks, and AI steps classify, extract, summarise and
describe images inside pipelines. The AI Assistant designs pipelines in a conversation, and Ask your data answers questions
with its sources. Every model answer is a DRAFT for a person to check.

## Start here
1. [Connect a model](#ai-models) — Add a model connection, test it, set its caps and the workspace default. ![](ai-model-connections)
2. [Write a prompt](#ai-prompts) — Instructions, variables and a JSON answer; try it before anything uses it. ![](ai-prompt-editor)
3. [Use it in a pipeline](#ai-steps) — Add an AI prompt step, row by row or a few at a time. ![](ai-step-settings)
4. [Describe a pipeline to the assistant](#ai-assistant) — It draws the flow; you check it, fill it and create it. ![](ai-assistant)
5. [Decide which models see which data](#ai-data-levels) — The data policy's three levels and their model rules. ![](ai-data-policies)

## Questions
### Is a model's answer ever used without a person?
Only if your pipeline does so. Every answer is a DRAFT: mark it so in the prompt, and hold the results for a review or an
Approval step when a person must decide. See [AI in pipelines](#ai-steps).

### Does patient data leave our machines?
Not by default. The **Sensitive** level starts as *Local only*: only model connections your organisation runs itself may
see it until an administrator changes the data policy. See [Which models may see which data](#ai-data-levels).

### Why did my AI step fail before it asked anything?
Usually a cap: the input had more rows than **At most rows**, or the connection's **Daily token budget** was reached.
See [AI in pipelines](#ai-steps--when-the-model-is-busy).

### What does the AI Assistant do without asking?
It reads, as you, what you may open. Anything that runs, saves or deletes comes back as a card to confirm, and a pipeline
is saved only when you choose **Create pipeline**. See [Design a pipeline with the AI Assistant](#ai-assistant).

### Where do I see what AI costs?
In **Cost & usage**: model tokens in and out, minutes of audio and pages read, by prompt and by pipeline. See
[What AI costs](#ai-costs).

### Can AI help design a report?
Yes: Report Studio has its own AI designer, see [Report Studio's AI designer](#rs-ai-designer).

## Related
- pipelines
- steps
- documents
- report-studio
- security
- billing
