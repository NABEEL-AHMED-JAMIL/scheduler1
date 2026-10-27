---
id: set-registries
title: Model connections, Tool Registry and Task Registry
summary: What a workspace administrator can switch on and off: the models prompts run on, the tools the AI Assistant may use, and the tasks pipeline steps may run.
section: Settings
who: Workspace administrators; the Tool Registry also opens to members whose page access includes Prompts
where: Administration & billing › Settings › Model connections (/settings/model-connections); Administration & billing › Settings › Tool Registry (/settings/tools); Administration & billing › Settings › Task Registry (/settings/task-registry)
related: set-reference, set-alerts, ai-models
---
Three pages under **Settings** decide what the workspace's AI and pipelines may use. Each says, for every row, what it
is, whether it is on here, and who set it. Something our team has **Blocked** for the workspace shows locked, with who
blocked it and why; it cannot be switched on from the workspace.

## Model connections
A **model connection** is where prompts run: a provider, its key, a default model, and two caps that keep a schedule
from running up a bill. One connection is the workspace's **Default**: a prompt that names none runs on it.

On a connection you can:
- **Test connection**, to check the key and see the models the provider lists.
- **Make active** or **Make inactive**; **Set as default**; **Edit connection**; **Delete connection**.
- Set its caps under **Edit connection**: **Calls in flight** (at most this many calls at once through the key; the
  rest wait in order) and **Daily token budget** (once the day's runs reach it, a step fails before any call is made;
  blank means no cap).
- Read its **Usage · last 30 days**, its runs by day, its **Recent runs** and the **Prompts on this connection**.

Keys are encrypted and never sent back to the browser. How to connect a model, and which data may go to which model,
is in [Your models: model connections](#ai-models).

![Model connections](set-model-connections "Model connections: the workspace's default connection, its caps, its models and its usage")

## Tool Registry
The **Tool Registry** lists the only operations the **AI Assistant** may ask for. Each tool calls a part of the
platform, checks the person's own role, and is logged on the run; a tool that writes asks the person first.

- Each row shows the **Tool**, what goes in and comes out, the **Permission** it needs, whether it **Asks first**, and
  when it was **Last used**.
- Narrow the list by kind (**Reads**, **Writes**), by state (**Enabled**, **Off**, **Blocked**), or search.
- Untick **Enabled** to switch a tool off for the workspace; **Reset** puts it back to its default. **Recent changes**
  lists who switched what.

## Task Registry
The **Task Registry** lists every task a pipeline's steps can run (**Read S3**, **Aggregate**, **AI prompt**,
**Approval** and the rest), what it does, its kind, what goes in and comes out, how many **Pipelines** use it and how
many runs they had this month. Every existing pipeline is listed too, as a **Legacy** task, edited on its own page.

- Untick a task under **In this workspace** to switch it off for the workspace. A task switched here says **Switched
  here**, with who set it; switching it back to its default undoes that.
- A count of pipelines opens the list behind it.
- **Recent changes** lists who switched what.

![Task Registry](set-task-registry "Task Registry: every task a step can run, how many pipelines use it, its runs this month and its switch")

> **Warning:** Check a task's **Pipelines** count before you switch it off: those pipelines have a step that runs it.

## Example
Summit Valley Health System runs only local models: one connection, *Local Ollama*, is the default, with **Calls in
flight** at 1. Its administrator switches off the assistant's tools that write to the store systems, so the AI Assistant
in that workspace can read them but never change them.
