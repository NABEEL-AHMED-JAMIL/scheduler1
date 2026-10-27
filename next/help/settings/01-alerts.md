---
id: set-alerts
title: Alerts: be told when something needs you
summary: Alert rules for failed runs, missed schedules, slow runs, waiting reviews and retention; who is told and how; an alert opening, and resolving by itself or by hand.
section: Alerts
who: Workspace administrators
where: Administration & billing › Settings › Alerts (/settings/alerts)
related: dev-webhooks, set-registries
popular: Get told when a run fails
aliases: monitor
---
An **alert rule** watches the workspace for one kind of trouble and, when it happens, opens an **alert** and tells the
people you chose: by the bell in the top bar, by mail, or by your webhooks. The alert stays open until the trouble
clears (it then resolves by itself) or someone resolves it.

## Start with the recommended rules
In a workspace with no rules yet, choose **Add the recommended rules**. It adds five, each telling the administrators
by the bell:

| Rule | Watches for | How bad |
|---|---|---|
| *A run failed* | A run fails | Warning |
| *Failures in a burst* | 3 or more runs of a pipeline fail within 15 minutes | Critical |
| *A schedule missed its slot* | A schedule's slot is skipped, missed or overdue | Warning |
| *A run is slower than usual* | A run takes over twice its pipeline's usual time | Warning |
| *A review is waiting too long* | A review or approval waits longer than 4 hours | Warning |

Change or remove any of them afterwards.

## Make a rule
1. Open **Administration & billing › Settings › Alerts** and choose **New rule**.
2. **Watch for**: **Runs failed**, **A schedule missed its slot**, **A run is slower than usual**, **A review is
   waiting too long** or **Retention needs attention**. The line under it says what to do when it fires.
3. Give it a **Name**.
4. Set when it fires: **Failed runs** and **Within (minutes)** for failed runs; **Slower than (× the usual p95)** for
   slow runs; **Waiting longer than (minutes)** for reviews.
5. **Schedule**: one schedule, or **Every schedule of the workspace**.
6. **How bad**: **Warning** or **Critical**.
7. **Tell them by**: **The bell**, **Mail**, **Webhooks**.
8. **Who hears of it**: **Administrators**, **Every other member**, **And these teams:**.
9. **Quiet hours** (optional): **Hold mail during quiet hours**, from and until. Mail waits until they end, then goes
   if the alert is still open. The bell and webhooks are not held.
10. Leave **On** ticked and choose **Save the rule**.

![A rule](set-alert-rule "New alert rule: what it watches, when it fires, how bad, how and whom it tells, and quiet hours")

> **Tip:** A "slower than usual" rule needs at least five completed runs of the pipeline in the last 30 days to know
> what usual is.

## Read the alerts
The left of the page lists the **Alerts**, open first, with **All** and **Open**. Each shows its title, what happened,
its kind, since when, how many times it was seen, and when it resolved: *cleared by itself* or *by a person*. An open
alert also says **What to do**.

- **Open** goes to what it is about, such as the failed run.
- **Resolve** closes it by hand, once you have dealt with it.

The right lists the **Rules**, grouped by what they watch: each one's sentence (**When**), whom it **Tells**, its
**Quiet hours**, when it **Last fired**, and its **On** switch. Its ⋯ menu has **Change**, **Mute for** an hour, 8
hours, a day or a week (its alerts are still recorded, nobody is told), **Unmute** and **Remove**.

![Alerts](set-alerts "Alerts: an alert that opened and cleared by itself, and the workspace's rules")

## Alerts to your own tools
A rule with **Webhooks** ticked sends `alert.opened` when it fires and `alert.resolved` when the alert clears, to every
webhook that subscribes to them, so an on-call tool can open and close its own incident. See
[Webhooks](#dev-webhooks).

## Limits
| What | Limit |
|---|---|
| Rules in a workspace | 50 |
| Resolved alerts kept | 30 days |
| Mute | An hour, 8 hours, a day or a week |

## Example
At Summit Valley Health System, the rule *Census feed failed* watches every schedule for a failed run and tells the
administrators and the IT team by the bell. At 06:00 the census file had not arrived, the run of *Late census feed
alert* failed and the alert opened. When the file landed and the run was retried from the failed step and completed,
the alert resolved: *cleared by itself*.
