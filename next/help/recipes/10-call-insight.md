---
id: rcp-call-insight
title: "Voice calls to insight: transcribe, ask a model, one insight file and one report per call"
summary: Each care-call recording dropped in the inbox is transcribed, read by a prompt for its summary, symptoms, actions, risks and status, and kept as one JSON file and one report per call.
section: Building blocks
who: A workspace administrator builds it; nurses read and check the reports
where: Get data in › Documents › Intake › File drop (/documents/intake/file-drop); Build › Pipelines (/pipelines/list); See results › Reports › Library (/reports/library)
related: ai-transcription, step-ai, ai-prompts, step-outputs, trg-file, rcp-ai-prompt, rcp-ocr
popular: Turn call recordings into reports
---
A home-health nurse's calls hold what matters about a patient after discharge: a swollen ankle, a weight gain, a
missed tablet. This recipe turns each recording into text with the platform's transcriber, asks a prompt what the call
says, and keeps the answer twice: as a JSON file a board or another pipeline can read, and as a report a nurse opens.

## What you'll build

- The prompt **Call insight (JSON)**: a two-sentence `summary`, lists of `symptoms`, `actions` and `risks`, and a
  `status` of `stable`, `needs follow-up` or `urgent`.
- The Report Studio template **Call insight**.
- The pipeline **Care-call insight, one report per call**, started for each recording named `call-*.m4a` that arrives,
  and every hour for any it missed.

![The call insight pipeline's steps](rcp-ai-call-steps "Care-call insight: the new recordings, transcribed two at a time, the prompt's JSON answer, one file and one report per call")

## What you need first

- A text model on a model connection, and the platform's transcriber (nothing to set up: **Transcribe audio** uses it).
- A storage connection that is the workspace's inbox.
- Two synthetic recordings, a nurse and a patient in scripted, fictional conversations spoken by computer voices:
  [call-01.m4a](/help/samples/call-insight/call-01.m4a) (swollen ankles and a weight gain) and
  [call-02.m4a](/help/samples/call-insight/call-02.m4a) (a healing wound). Also
  [silent.wav](/help/samples/call-insight/silent.wav), ten seconds of silence, for the last check.

## Build it

### The prompt

Save **Call insight (JSON)** under **Build › Pipelines › Prompts** with your text model, **Temperature** 0.1, **Max
tokens** 500, the variables `file_name` and `transcript` (text), and the answer as a **JSON object**
([Write and test a prompt](#ai-prompts)). Try it with a few lines of transcript, then **Save & activate**.

```System instructions: Call insight (JSON)
You write short DRAFT notes for a person at a fictional hospital group, who checks and corrects every one. Use only the facts given; write 'not recorded' for anything missing. Never diagnose or prescribe. All data is synthetic.
```

```Message template: Call insight (JSON)
Transcript of a synthetic nurse-patient call ({{file_name}}): {{transcript}}. Write summary (2 sentences), symptoms, actions, risks (short lists) and status (stable, needs follow-up or urgent).
```

```Output schema: Call insight (JSON)
{ "type": "object", "properties": { "summary": { "type": "string" }, "symptoms": { "type": "array", "items": { "type": "string" } }, "actions": { "type": "array", "items": { "type": "string" } }, "risks": { "type": "array", "items": { "type": "string" } }, "status": { "type": "string", "enum": ["stable", "needs follow-up", "urgent"] } }, "required": ["summary", "symptoms", "actions", "risks", "status"] }
```

### The template

In **Reports › Templates**, make **Call insight**: the call's file name and length, the status, the summary (labelled
"AI DRAFT for a nurse to check"), and the symptoms, actions and risks as three lists. Publish it
([Templates and the library](#rs-templates)).

### The pipeline

1. Make `Care-call insight, one report per call` (**Data sensitivity** **Sensitive**) with the six steps below.
2. **Schedule**: **On a timetable**, **Hourly**; under **Also starts when**, tick **A file arrives**, **Which files**
   `call-*.m4a`, **Files per run** `1`. **Create schedule**.

| # | Step | Key | Settings |
|---|---|---|---|
| 1 | Read S3 | `calls` | **Prefix** `home/calls/call-`, **Read as** list, **The run's own files first** on, **Which objects** `last_run`, **At most objects** 20 |
| 2 | Transcribe audio | `text` | **Bucket** your bucket, **File key column** `key`, **Timestamps** off, **When a file fails** `fail`, **Calls at once** 2, **At most files** 20 |
| 3 | Compute | `call` | The three formulas below |
| 4 | AI prompt | `insight` | **Prompt** Call insight (JSON); **Fields** `summary`, `symptoms`, `actions`, `risks`, `status`; **At most rows** 20 |
| 5 | Upload to bucket | `keep` | **Object key** `home/insights/{{file_stem}}.json`, **Format** json, **One file per row** on, **JSON columns** `symptoms`, `actions`, `risks` |
| 6 | Generate report | `report` | **Use a saved template** Call insight; **One report per row** on; **At most reports** 20; **JSON columns** `symptoms`, `actions`, `risks`; **Report name** `Call · {{file_name}}` |

```Compute: the call's name and length
file_name = regex_extract(key, '(call-[^/]+)$')
file_stem = regex_extract(key, '(call-[^/]+)[.][a-z0-9]+$')
duration  = concat(text(round(coalesce(duration_seconds, 0) / 60, 1)), ' min')
```

Tick **Empty when it cannot be worked out** on `duration`. A file dropped in **File drop** lands as
`intake/<date>/<arrival>-call-01.m4a`; the two expressions keep only the part from `call-` on, so the names stay short.

### Send the calls in

Drop `call-01.m4a` and `call-02.m4a` on **Get data in › Documents › Intake › File drop**. Each starts a run of its own.

## Check it worked

1. Two runs, each **Started by** *A trigger*, 6 of 6 steps completed, one item each.
2. Step 2 adds `transcript`, `language` (`en`), and `duration_seconds` (call-01 is about 35 seconds, call-02 about 20).
3. The **AI answers** tab has one **Call insight (JSON)** call per run. For call-01, the symptoms name the swollen
   ankles, the weight gain and the breathlessness on the stairs; the status is `needs follow-up` in most runs.
4. `home/insights/call-01.json` and `home/insights/call-02.json` are in your bucket, the lists as JSON lists.
5. **Reports › Library** has **Call · call-01.m4a** and **Call · call-02.m4a**, one version each.

> **Note:** Not yet verified end to end in Summit Valley: its care-call pipeline is built and has not run yet. The
> transcriber's words and the model's lists differ a little from run to run.

## Common mistakes

- **A silent or broken recording fails the run.** With **When a file fails** `fail`, one bad file stops the step. Set
  it to `null` to keep the file with an empty transcript and the reason in `transcribe_error`, then **Filter** those
  rows out before the prompt (or send a notice about them). Try it with `silent.wav`.
- **The run reads every call again.** **Which objects** `last_run` reads only the recordings since the schedule's last
  completed run; a failed run moves nothing on, so its files come again next time.
- **The prompt gets no transcript.** The variable must be named `transcript`, the column **Transcribe audio** adds; a
  different name needs **Variables** in the step.
- **The lists print as one line in the report.** Name `symptoms`, `actions` and `risks` under **JSON columns** in both
  the upload and the report step.
- **A long recording is slow.** A recording may be up to 500 MB, and the step's time limit is two hours. Two at a time
  is a good start on a single machine.

> **Warning:** The insight is a DRAFT for the nurse to check against the recording. It never replaces listening to a
> call that sounds urgent.
