---
id: ai-data-levels
title: Which models may see which data
summary: The three data levels, the model rule for each, how a call's level is decided, and the AI Assistant's write tools.
section: Models and prompts
who: Workspace administrators change the data policy; every member may read it
where: Administration & billing › Administration › Data policies (/administration/data-policies)
related: ai-models, ai-prompts, ai-assistant
---
The workspace's **data policy** decides, for each level of data, which models may see it, how long a run keeps its working
files, and whether the AI Assistant's write tools may act on it. A prompt, an AI step or the assistant runs only on the
models its data's level allows.

![The data policy's levels side by side](ai-data-policies "Data policies: Sensitive, Internal and Public side by side, a setting a row")

## The three levels
| Level | What it is for |
|---|---|
| **Sensitive** | Personal, health or confidential data (PHI, PII, confidential, restricted) |
| **Internal** | The workspace's everyday data. A call is internal when nothing says otherwise |
| **Public** | Data anyone may see: published figures, open datasets and APIs |

## How a call's level is decided
- A prompt declares its level with **Data sensitivity** on its editor ([Write and test a prompt](#ai-prompts)).
- A pipeline may declare one in its **Settings** (Patient data is Sensitive).
- An API collection or a data contract has a level of its own.

When nothing is set, the call is read as internal. The page's **How a call's level is decided** box says the rule in full.

## Set the model rule
1. Open **Administration & billing › Administration › Data policies**.
2. For each level choose a **Model rule**:
   - **Any model**: any of the workspace's model connections, hosted or local.
   - **BAA-signed hosted, or local**: local models, and hosted models only on a connection marked as covered by a signed
     Business Associate Agreement (marked on **Model connections**).
   - **Local only**: only models on your own machines (Ollama connections); the data never goes to a hosted provider.
3. Optionally tick **Allowed models**: none ticked allows any model the rule allows; a ticked connection allows each of its models.
4. **Keep run files**: how many days a run keeps its working copies for its next steps and downloads (1 to 3650). Blank
   is the pipeline's own: 24 hours unless it sets another.
5. **AI write tools**: whether the assistant may run pipelines, create PDFs, save or delete files and call APIs that
   change data at this level. It still asks first.
6. **Minimum-fields warning**: reminds whoever builds a step to send a model only the fields it needs.
7. Choose **Save policy**.

> **Privacy:** Until a level is saved it follows its default: public and internal data may go to any model and the write
> tools may act on it; sensitive data stays on local models and the write tools do not act on it.

> **Note:** How you configure and use these controls is your organisation's decision. The console does not by itself make a
> workspace compliant with any law or standard, and marking a connection as covered by an agreement is your statement,
> not the console's check.

## On the same page
- **Bulk review**: whether runs and documents may be approved many at once (see
  [Decide many at once](#apr-bulk)).
- **Retention**: how long each kind of record is kept, and legal holds.

## Example
Summit Valley keeps the defaults: its patient data is Sensitive and runs only on *Local Ollama*. A research prompt over
public CDC figures is marked Public, so it could run on a hosted model if the workspace added one.

## Limits
| What | Limit |
|---|---|
| Keep run files | 1 to 3650 days, or blank for the pipeline's own |
| Who may change the policy | A workspace administrator |
