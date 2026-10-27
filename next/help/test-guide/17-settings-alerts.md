---
id: qa-settings
title: "Test area 17: settings and alerts"
summary: Alert rules that open and resolve alerts, the Tool and Task Registries, configuration values and secrets, appearance and themes, and who may change settings.
section: Administer
who: Testers; as the administrator (A), with R, V and X for access and isolation
where: Settings › Alerts (/settings/alerts); Settings › Tool Registry (/settings/tools); Settings › Task Registry (/settings/task-registry); Settings › Configuration values (/settings/values); Administration › Appearance (/administration/appearance)
related: set-alerts, set-registries, set-reference, set-appearance, gs-profile, qa-guide
---
These checks cover the workspace's own settings: alerts that tell people when something needs them and clear by
themselves when it is fixed, the registries that decide which tools the AI Assistant and which tasks pipelines may use,
configuration values and secrets that pipelines name instead of holding, and themes.

**Before you start:** `QA occupancy` and its schedule `QA daily` ([QA-08](#qa-triggers)), set to read the missing file
of [QA-10](#qa-runs) so a run can fail on purpose, and `QA team` ([QA-03](#qa-people)).

Tested by ______ on ______

## Alerts
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-17.01 | The recommended rules | As A, **Settings › Alerts** in a workspace with no rules: **Add the recommended rules** | Five rules are added: *A run failed*, *Failures in a burst*, *A schedule missed its slot*, *A run is slower than usual*, *A review is waiting too long*, each telling the administrators by the bell | ☐ Pass ☐ Fail |
| QA-17.02 | Make a rule | **New rule**: **Watch for** **Runs failed**, **Name** `QA failed`, **Failed runs** 1, **Schedule** `QA daily`, **How bad** **Warning**, **Tell them by** **The bell**, **Who hears of it** **Administrators** and **QA team**; **Save the rule** | The rule is listed with its sentence (**When**), whom it **Tells** and its **On** switch | ☐ Pass ☐ Fail |
| QA-17.03 | It fires | **Run now** on `QA daily` (it fails) | An alert opens under **Alerts**, open first, with what happened, since when and **What to do**; A and R (in `QA team`) get a bell notice | ☐ Pass ☐ Fail |
| QA-17.04 | It opens what it is about | **Open** on the alert | The failed run's page opens | ☐ Pass ☐ Fail |
| QA-17.05 | It clears by itself | Put the file in place; retry the run from the failed step | The run completes; the alert resolves, *cleared by itself* | ☐ Pass ☐ Fail |
| QA-17.06 | Resolve by hand | Make it fail again; **Resolve** on the alert | It is resolved, *by a person* | ☐ Pass ☐ Fail |
| QA-17.07 | Mute | Rule's ⋯ › **Mute for** an hour; make the run fail | The alert is recorded, but nobody is told; **Unmute** restores it | ☐ Pass ☐ Fail |
| QA-17.08 | Alerts to a webhook | Tick **Webhooks** on the rule; a webhook subscribed to `alert.opened` and `alert.resolved` ([QA-14](#qa-developers)); fail and fix the run | The receiver gets `alert.opened`, then `alert.resolved` | ☐ Pass ☐ Fail |

## Registries
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-17.09 | The Task Registry | **Settings › Task Registry** | Every task with what it does, its kind and how many **Pipelines** use it; **Write Database** listed and not available to add | ☐ Pass ☐ Fail |
| QA-17.10 | Switch a task off | Untick **Sort** under **In this workspace** (a task `QA occupancy` does not use); open a pipeline's **Add step from the Task Registry…** | **Sort** is no longer offered, or is marked **(disabled)** with a hint; the registry row says **Switched here** with A's name. Switch it back | ☐ Pass ☐ Fail |
| QA-17.11 | The Tool Registry | **Settings › Tool Registry**: filter **Writes** | Each tool with the **Permission** it needs and whether it **Asks first**; the write tools ask first | ☐ Pass ☐ Fail |
| QA-17.12 | Switch a tool off | Untick **Enabled** on a write tool; open the AI Assistant's **Context** tab | The tool is listed as blocked, with the reason; **Recent changes** on the registry names A. **Reset** it afterwards | ☐ Pass ☐ Fail |

## Values, appearance and the rest
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-17.13 | A secret is never shown again | **Settings › Configuration values** › **New value**: **Key** `QA_TOKEN`, **Kind** secret, a made-up value; save; open it | The value is not shown; to change it you type a new one | ☐ Pass ☐ Fail |
| QA-17.14 | A key's form | **New value** with **Key** `qa-token` | Refused: capital letters, digits and underscores, a letter first | ☐ Pass ☐ Fail |
| QA-17.15 | A plain credential in a pipeline is refused | In a step setting whose name looks like a credential (a password), type a plain value; **Save** the pipeline | The save is refused: it must hold a `${secret:…}` reference | ☐ Pass ☐ Fail |
| QA-17.16 | The workspace's default theme | **Administration › Appearance**: pick **Ocean**; **Save default**; sign in as V (who has not picked a theme) | V opens in **Ocean** | ☐ Pass ☐ Fail |
| QA-17.17 | A person's own theme wins | As R, **Your profile** › **Appearance** › **Dark** | R's console turns dark and stays dark on another device (**Saved to your account**); the workspace's default does not change it. **Use the workspace default** goes back | ☐ Pass ☐ Fail |
| QA-17.18 | Kafka & Topics | **Settings › Kafka & Topics** | The brokers the workspace publishes through, whether they answer, and each topic's readers; with no connection of its own, it says it uses the platform's default broker | ☐ Pass ☐ Fail |

## Access and isolation
| # | Check | Steps | Expected | Pass / Fail |
|---|---|---|---|---|
| QA-17.19 | Settings are the administrators' | As R and V, go to `/settings/alerts`, `/settings/values` and `/administration/appearance` | Refused | ☐ Pass ☐ Fail |
| QA-17.20 | The Tool Registry opens with Prompts | As a member whose profile includes **Prompts**, open `/settings/tools` | The registry opens to read | ☐ Pass ☐ Fail |
| QA-17.21 | Another workspace's settings | As X, **Settings › Alerts** and **Configuration values** | `QA failed` and `QA_TOKEN` are not there | ☐ Pass ☐ Fail |

## Example
At Summit Valley the rule *Census feed failed* opened an alert when the census file for 12 October had not arrived, told
the IT team by the bell and the *Ops alerts* webhook, and resolved by itself once the file landed and the run was retried.
