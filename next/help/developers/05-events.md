---
id: dev-events
title: Events and event routes
summary: Your systems send events of your own types; an event route says which pipeline or workflow each type starts, and the data contract it must meet.
section: Use the API
who: Workspace administrators make event routes; your systems send events with events:write
where: Administration & billing › Developers › API Clients › Event routes (/developers/api-clients)
related: dev-clients, dev-runs, dev-webhooks
---
An **event** is a message from one of your systems saying that something happened: *a referral was accepted*, *a lab
result is ready*, *a device took a reading*. Its **type** is yours to name. An **event route** says what that type
starts in the workspace: a run of a pipeline (with the event's data as the run's record) or a workflow request.

## Add an event route
1. Open **Administration & billing › Developers › API Clients** and scroll to **Event routes**.
2. Choose **New event route**.
3. **Event type**: letters, digits and `. _ : -`, such as `lab.result.created`.
4. **Starts**: **A pipeline's run** (then choose the **Pipeline**) or **A workflow request** (then type the
   **Workflow key** of one of your approval workflows).
5. **Data contract (optional)**: the name of a data contract the event's data must meet.
6. Choose **Add route**.

![Event routes](dev-routes "Event routes: each event type, what it starts, its data contract and its state")

Each route's row shows its **Event type**, what it **Starts**, its **Contract** and its **State**, with **Change** and
**Remove**.

## What happens when an event arrives
- A type with a route starts what the route names, at once. The answer lists what it started, and what could not start
  and why (for example a run of that pipeline still in flight).
- With a data contract, data that does not meet it is refused with each wrong field named, and nothing starts.
- A type that no route takes is refused.

> **Tip:** Name event types for what happened, from your system's side (`admission.accepted`), not for what you want
> the console to do. Then one event can later start a second pipeline without your system changing.

## Events the platform sends back
The other direction is **webhooks**: the platform's own events (a run started, completed or failed, a review requested
or decided, an item finished, a file ready, an alert opened or resolved) sent to a URL of yours. See
[Webhooks](#dev-webhooks).

## Example
Summit Valley Health System routes three event types:

| Event type | Starts | Contract |
|---|---|---|
| `admission.accepted` | The workflow *Patient journey* | — |
| `lab.result.created` | The pipeline *Journey 6 · Lab results from the partner lab* | `lab_result` |
| `device.reading` | The pipeline *Remote monitoring: readings over threshold* | `device_reading` |

When *Northgate Labs* sends a lab result without its test code, the contract refuses it and no run starts. When
*HomeLink devices* sends an SpO2 reading of 88, the remote monitoring pipeline runs and pages the care team.
