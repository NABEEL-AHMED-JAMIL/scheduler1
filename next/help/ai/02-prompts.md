---
id: ai-prompts
title: Write and test a prompt
summary: Instructions, a message with variables, a JSON answer checked against a schema, Try it, and versions.
section: Models and prompts
who: Workspace administrators write, try, activate and delete prompts; anyone whose page access includes Prompts reads the list
where: Build › Pipelines › Prompts (/pipelines/prompts)
related: ai-models, ai-steps, ai-data-levels, ai-ask-data
popular: Write a prompt and try it
---
A **prompt** is what a step says to a model: who the model is, the message sent each time with **variables** the pipeline
fills in, and the shape of the answer. A pipeline's **AI prompt** step runs a saved prompt row by row, so the same words are
used every time and every change is kept as a version.

![The prompt editor beside Try it](ai-prompt-editor "A prompt open in the editor: About it and Model on the left, Try it and its recent runs on the right")

## Write a prompt
1. Open **Build › Pipelines › Prompts** and choose **New prompt**.
2. **About it**: a **Name** (say what it does, and add *(DRAFT)* when the answer is a draft for a clinician), a
   **Description**, the **Data sensitivity** of what it is sent (Public, Internal or Sensitive; *Not set* is read as
   internal), and **Tags**. A file type in the tags (pdf, docx) offers the prompt in the file chat.
3. **Model**: the **Connection** (blank runs on the workspace default) and the **Model** (blank is the connection's default).
   **Temperature** 0 gives the steadiest answers; **Max tokens** caps the answer's length.
4. **What it says**: the **System instructions** (the same for every run) and the **Message template**, the text sent each
   time. Type `{{name}}` or click a variable under **Insert** to put one in.
5. **Variables**: **Add variable** for each value the pipeline fills in. Give it a **Type** (text, number, url, or
   file → text), tick **Required** if a row without it should fail, and a **Sample value** for Try it.
6. **The answer**: choose **Text** (used as it is) or **JSON object**.
7. Choose **Save draft**, or **Save & activate** to make it the version steps use.

```A message template with two variables
Synthetic wound photo for {{mrn}}: measured in code {{length_cm}} x {{width_cm}} cm. Describe the stage, tissue and exudate.
```

> **Tip:** Write the instructions so the model never invents a value, and say the answer is a draft. The showcase's
> *Wound description (DRAFT)* begins: describe only what is visible; your answer is a DRAFT, never a diagnosis.

## Ask for a JSON answer
With **Output** set to **JSON object**, an **Output schema** appears. The schema is sent to the model, and every answer is
checked against it, with one repair round. An answer that still does not fit is **held for review**, never used.

```An output schema with an allowed list
{ "properties": { "stage": { "type": "string", "enum": ["1", "2", "3", "4", "Unstageable"] }, "summary": { "type": "string" } } }
```

- Give each key a `type`; list allowed values in `enum` and no other value is accepted.
- `properties` without `required` requires them all. A blank schema accepts any JSON object.
- Keep schemas small. On a local model, a long list of allowed values or tight number limits can make each answer take
  minutes.

## Try it before anything uses it
1. Fill each variable's **Sample value**, or choose the folder button to fill it from a file in a bucket (any type the file
   chat can read).
2. Choose **Run** under **Try it**. It runs the page as it stands, saved or not, and records the run as a try.
3. Read the answer, the tokens in and out, and the time. **Show rendered input** shows exactly what was sent.
4. **Recent runs** lists the tries and the pipeline steps that ran the prompt, with their version.

> **Note:** A try spends the workspace's tokens like any other call, and is billed. A JSON answer that does not fit the
> schema shows as **Held for review**, with the answer that was held.

## Versions
Every save is a version. In the editor, **Save as v2** (the next number) keeps the change without activating it; **Save &
activate** makes it current. The list shows each prompt's version, connection and model, its variables, whether it answers
Text or JSON, how many pipelines use it, its runs and when it last ran (and whether that run failed or was held).

From a row's **⋮** menu: **Edit & try**, **Activate** or **Deactivate**, and **Delete**.

## Example
Summit Valley's *Care plan (DRAFT)* prompt takes the findings of one admission and answers a JSON object with `risk`,
`goals`, `interventions` and `follow_up`. Journey 9 runs it; when `risk` is *High*, the *Patient journey* workflow asks a
senior physician as well (see [Design an approval workflow](#apr-workflows)).

![The Prompts list](ai-prompts "Build › Pipelines › Prompts: every prompt with its connection, variables, output and use")

## Limits
| What | Limit |
|---|---|
| Variable names | Letters, digits and underscores, starting with a letter or underscore |
| Repair rounds for a JSON answer | One; then the answer is held for review |
| Who may write, try or delete | A workspace administrator (in a managed workspace, read only) |
