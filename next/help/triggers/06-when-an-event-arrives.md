---
id: trg-events
title: Start a pipeline when an event arrives
summary: Event routes say which pipeline or workflow each of your event types starts when your systems send it.
section: Start on arrival
who: A workspace administrator sets up event routes; your systems send events with an API client that has events:write
where: Administration & billing › Developers › API Clients (/developers/api-clients)
related: trg-api, trg-workflow, step-check, step-read, dev-overview
---
Your own systems can tell the platform that something happened: a lab result was created, a device took a reading, a
patient was admitted. Each such message is an **event** with a type, such as `lab.result.created`, and its data. An
**event route** says what an event type starts: a pipeline's run, or a workflow request.

An event of a type no route takes is refused, so nothing runs by accident.

## Add an event route

1. Open **Administration & billing › Developers › API Clients** and scroll to **Event routes**.
2. Choose **New event route**.
3. **Event type**: letters, digits and `.` `_` `:` `-`, such as `order.received`.
4. **Starts**: **A pipeline's run** (then choose the **Pipeline**) or **A workflow request** (then type the **Workflow
   key**).
5. **Data contract (optional)**: the name of a data contract the event's data must meet.
6. Leave **Active** ticked, and choose **Add route**.

Use **Change** to point a route elsewhere or switch it off, and **Remove** to delete it.

![The event routes of Summit Valley](trg-events "Event routes: each event type and what it starts")

## What the pipeline receives

The event's data is the run's record. Give the pipeline's **Source** (on its **Settings** tab) the setting **The task
payload: one row, a column per tag**, so the first step reads it as one row, and check it with a **Validate** step
first.

## Send an event

Your system sends the event to the platform's API with an API client that has the `events:write` scope. The request
and its answers are described in the Developer portal (**Developers › Developer portal**), with samples.

## Example

Summit Valley's partner lab, Northgate Labs, sends `lab.result.created` each time a result is ready. The route starts
**Journey 6 · Lab results from the partner lab**, which validates the result, flags abnormal and critical values,
keeps the file and tells the physicians at once when a value is critical. The **HomeLink devices** client sends
`device.reading` the same way.

## Limits

| What | Limit |
|---|---|
| An event type | 128 characters |
| Who sets up routes | A workspace administrator; in a workspace our team manages they are read-only to you |
| API calls | The per-client and per-workspace limits shown on API Clients |
