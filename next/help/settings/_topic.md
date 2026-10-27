---
title: Settings, alerts and help
chapter: 18
part: Part VII · Administer
icon: settings
blurb: Alerts, model connections, the registries, configuration values, appearance and help.
paths: /settings, /administration/appearance, /docs
sections: Alerts | Settings | Help
---
The workspace's settings: alert rules that tell the right people when runs fail, schedules miss or reviews wait; the
models, tools and tasks the workspace may use; the values pipelines read at run time; the console's look; and where to
find help.

## Start here
1. [Get told when something fails](#set-alerts) — Alert rules, who hears of them, and alerts that open and resolve. ![](set-alerts)
2. [Decide what may be used](#set-registries) — Model connections, the Tool Registry and the Task Registry. ![](set-task-registry)
3. [Keep values and secrets in one place](#set-reference) — Configuration values, home pages, task groups, topics. ![](set-values)
4. [Pick a theme](#set-appearance) — Your own theme, and the workspace's default. ![](set-appearance)
5. [Find help](#set-help) — The help centre, the Developer portal, and whom to ask. ![](set-help)

## Questions
### How do I get told when a run fails?
Make a rule under **Settings › Alerts** that watches **Runs failed**, or choose **Add the recommended rules**, and pick
who hears of it and how. See [Make a rule](#set-alerts--make-a-rule).

### An alert went away by itself. Is that right?
Yes: an alert resolves by itself when the trouble clears, for example when a later run of the pipeline completes. It
says *cleared by itself*. See [Read the alerts](#set-alerts--read-the-alerts).

### Can I stop an alert from waking people at night?
Yes: give the rule **Quiet hours**. Mail waits until they end; the bell and webhooks are not held. Or **Mute** the rule
for a while. See [Make a rule](#set-alerts--make-a-rule).

### Where do I put a password a pipeline needs?
In **Configuration values**, as a secret; the pipeline names it as `${secret:KEY}`. It is never shown again. See
[Configuration values](#set-reference--configuration-values).

### Why is a tool or a task marked Blocked?
Our team blocked it for the workspace; the row says who and why, and it cannot be switched on from the workspace. Ask
your account team. See [Model connections, Tool Registry and Task Registry](#set-registries).

### How do I change the console to dark?
Pick **Dark** (or another theme) from the theme button in the top bar, or under **Theme** on your profile. See
[Pick your own theme](#set-appearance--pick-your-own-theme).

## Related
- ai
- administration
- developers
- troubleshooting
