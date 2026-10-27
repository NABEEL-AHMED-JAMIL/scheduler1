---
id: bill-usage
title: How usage is counted
summary: Every meter in plain words, what each counts and in what unit, how meters roll up into services, the rate card, and the workspace's billing time zone.
section: Usage
who: Workspace administrators read their workspace's usage and bills
where: Administration & billing › Billing › Cost & usage (/billing/usage)
related: bill-cost, bill-not-billed, bill-invoices, bill-estimates
aliases: billing
---
Everything the workspace uses is **metered** as it happens: each run, each model call, each page read, each file kept.
Each meter is priced from the workspace's **rate card**, and **Cost & usage** shows the month as the invoice will read
it. This article lists the meters, so a line on a bill can be traced back to what made it.

## The meters
Each line on **Cost & usage** and on an invoice is one meter: its name, and under it its code in small type.

| Meter | Service | What it counts | Unit |
|---|---|---|---|
| **Pipeline runs** | Pipelines | Each run of a pipeline | run |
| **Worker minutes** | Pipelines | Time a run's steps spent working | minute |
| **Kafka topics** | Pipelines | Topics the workspace keeps, by the hour | topic-hour |
| **Model tokens in** | Model calls | Text sent to a model: prompts, documents, questions | per 1,000 tokens |
| **Model tokens out** | Model calls | Text a model wrote back | per 1,000 tokens |
| **Images described** | Model calls | Each image a vision model looked at | image |
| **Transcript minutes** | Model calls | Minutes of audio turned into text | minute |
| **Pages read (OCR)** | Analytics & tools | Each page the platform's text reader read | per 1,000 pages |
| **Documents converted** | Analytics & tools | Each document converted, each PDF made from a dataset or a run, each report version generated | document |
| **Analytics queries** | Analytics & tools | Each query of a file, in Analytics Studio or by a dashboard widget | query |
| **Analytics data scanned** | Analytics & tools | The data those queries read | GB |
| **Storage kept** | Storage | The data kept in the workspace's storage, measured nightly | GB-hour |
| **Bytes written**, **Bytes read** | Storage | Data written to and read from storage | GB |
| **Bytes deleted (data churn)** | Storage | Data deleted from storage | GB |
| **Storage reads**, **Storage writes**, **Storage deletes** | Storage | Each operation on a stored file | per 1,000 operations |
| **API calls** | API | Each call your systems make to the API | per 1,000 calls |
| **Webhook deliveries** | API | Each webhook delivery that reaches your receiver | per 1,000 deliveries |
| **Seats** | Seats | Each person in the workspace, by the day | user-day |

The prices are not in this table because they are your account's: they come from your workspace's rate card, and
**Cost & usage** shows the rate beside every line.

## Services
Meters roll up into six services, each with its own colour on every chart: **Storage**, **Model calls**,
**Pipelines**, **Analytics & tools**, **API** and **Seats**. **By service** on **Cost & usage** adds them up.

## The rate card
A rate card is a list of prices, kept in versions by our team. The chip **Priced with** at the top of **Cost & usage**
names the card and version that prices your workspace (for example *Standard 2026 v2*). A card may also have
**allowances and tiers** (an amount included, or a lower price past a threshold) and **pricing rules** (another price
for one pipeline, a pipeline tag or a data class); a line priced by a rule says so.

> **Note:** A price change is a new version of the card with a date it starts from. An invoice already issued keeps the
> version that priced it.

## Your billing time zone
Days and months are counted in your workspace's **billing time zone**: a day runs from midnight to midnight there, and
a month is a calendar month there. **Cost & usage** shows it in the chip **Days in** (for example *America/Chicago*,
the default), and the invoice prints it beside its period. The API's monthly quota counts the same month. Our team
sets the zone; ask your account team to change it.

## Example
At Summit Valley Health System, one run of *Journey 7 · Wound photo: measure, describe* bills a **Pipeline run**, the
**Model tokens in** and **out** of its prompt, an **Image described** for the wound photo, and **Storage writes** for
the files it keeps. The run's own line under **By run** on **Cost & usage** adds them up.
