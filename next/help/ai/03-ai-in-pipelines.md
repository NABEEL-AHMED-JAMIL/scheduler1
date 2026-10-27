---
id: ai-steps
title: AI in pipelines
summary: The AI prompt step: classify, extract, summarise or describe an image, row by row or a few at a time, and what happens when the model is busy.
section: AI at work
who: Workspace administrators add and change steps; anyone who may open the run reads its AI answers
where: Build › Pipelines (/pipelines/list); Run & review › Runs (/runs/latest)
related: ai-prompts, ai-models, ai-transcription, run-page, apr-approval-steps
---
A pipeline asks a model with an **AI prompt** step. The step runs a saved prompt once for each row it reads, fills the
prompt's variables from the row's columns, and adds the answer to the row. What the step does is up to the prompt:

- **Classify**: a referral's urgency, a denial's reason, a card transaction's spend category.
- **Extract**: fields from a note or a letter, as a JSON answer.
- **Summarise**: a visit, a care plan, a discharge summary, always as a DRAFT.
- **Describe an image**: a wound photo or an X-ray sent to a vision model with the prompt.

Documents that arrive as files (referrals, lab results, invoices) are read into fields by Document Intelligence rather
than by a prompt step; see [How documents are read](#doc-reading).

![An AI prompt step's settings](ai-step-settings "The settings of an AI prompt step: the prompt, its variables, the image to send and the answer's fields")

## Add an AI step
1. Open the pipeline under **Build › Pipelines** and go to **Steps**.
2. In **Add step from the Task Registry…**, find **AI prompt** and add it where the rows are ready.
3. Under **Task settings**, pick the **Prompt**.
4. **Variables**: name a value for a variable only when it does not come from a column of the same name, as in
   `{{record_id}}`. A required variable with no value fails that row.
5. For an image, fill **Image**: the **Bucket** and the **Image key column** that holds each row's image (png, jpg, webp or gif).
6. **Answer column** names the column the answer goes in. For a JSON answer, add **Fields**: **From the answer at** (a path
   such as `status` or `result.score`) and **As column**, so later steps and conditions read them as ordinary columns.
7. **When a row fails**: fail the step, skip the row, or keep it with the answer empty.
8. **At most rows**: the step refuses an input with more rows before it makes any call.
9. **Apply**, then **Validate** and **Save** the pipeline.

> **Tip:** Send a model only the columns it needs. Measure, count and compare in ordinary steps first and let the model
> describe: Summit Valley measures each wound against the ruler in code, and the vision model only describes the stage,
> tissue and exudate.

## Row by row, or a few at a time
**Calls at once** (1 to 8) lets the step ask several rows at the same time. 1, the default, asks one after another.
Answers keep the rows' order whatever order they finish in, and the workspace's calls together are capped as well, so one
busy pipeline cannot take every call. The model connection's **Calls in flight** still applies.

## When the model is busy
A model or provider that answers *busy* is not a failure at first. The step waits (as long as the provider asks, otherwise
1, 2, 4 and then 8 seconds), asks again up to four times, and halves its own number of calls at once while it is busy.
Only a row that is still refused after that fails, and then **When a row fails** decides what happens.

> **Warning:** A connection's **Daily token budget** is a hard stop: once the day's runs reach it, the step fails before
> any call is made. Raise the budget or wait for the next day, then retry the run from the failed step.

## Read the answers
A run of a pipeline with AI steps has an **AI answers** tab. Each answer shows the prompt and its version, whether it was
**Answered** or held, the time and the tokens; open one to read the answer itself.

![A run's AI answers](ai-run-answers "A run's AI answers tab: the wound description, a JSON answer from the vision model")

A JSON answer that does not fit the prompt's schema is held for review and never used. When the pipeline asks for a review,
its results wait in **Review** until a person approves them; see [Review a run's results](#apr-run-review). For a sign-off
on one step in the middle of a run, use an Approval step: [Approval steps inside a run](#apr-approval-steps).

## Example
Summit Valley's *Journey 7 · Wound photo: measure, describe, wound-care review* reads the photo a nurse dropped, measures
it against the 1 cm ruler, asks *Wound description (DRAFT)* on the vision model, compares the area with the last visit,
and waits for Sam Harper (Wound care) to approve the measurement before one report per photo is made.

## Limits
| What | Limit |
|---|---|
| Calls at once | 1 to 8 per step; the workspace's calls together are capped too |
| At most rows | Default 50, at most 500 |
| Fields taken from a JSON answer | 50 |
| Tries when the model is busy | 4, with waits of 1, 2, 4 and 8 seconds unless the provider says otherwise |
| Image types | png, jpg, webp, gif |
