---
id: gl-glossary
title: Glossary
summary: The words the console uses, A to Z, each in plain words with where to read more.
section: Glossary
who: Everyone
related: gl-reference, ts-faq
popular: What does a word in the console mean?
aliases: glossary
---
The words the ETL Console uses, in plain words. A word in **bold** is the console's own label. Where an article says
more, the meaning links to it.

## A
| Term | Meaning |
|---|---|
| **Access delegate** | A member an administrator allows to grant some pages and tabs to some people, for a set time. Everything they grant is recorded. See [Delegates](#adm-delegates). |
| **Active** | Switched on: an active schedule runs, an active pipeline or workflow may be started. Inactive ones keep their history. |
| **AI answers** | A run's tab listing each call it made to a model: the prompt, how long it took and the tokens it used. |
| **AI Assistant** | A conversation in which you describe a pipeline in plain words and the assistant proposes its steps. See [Design a pipeline with the AI Assistant](#ai-assistant). |
| **Alert rule** | A rule under **Settings › Alerts** that raises an alert when something needs attention, such as a failed run, and tells people or a webhook. |
| **API client** | One of your systems as the customer API knows it: an id, a secret, its scopes and where it may call from. See [API clients](#dev-clients). |
| **API collection** | A saved set of requests to another system's API, with its address, sign-in and variables, for pipelines to call. See [Make an API collection](#con-api-collections). |
| **Approval** | A person's decision, approve or reject, on a run, a document, a report or a workflow step. |
| **Approval step** | A step in the middle of a pipeline that pauses the run until reviewers decide. See [Approval steps inside a run](#apr-approval-steps). |
| **Approval workflow** | A designed sequence of approvals, tasks, conditions and pipeline runs that a request walks through. See [Design an approval workflow](#apr-workflows). |
| **Approved data** | The values of approved documents, kept as rows that pipelines can read. See [Approved data](#doc-approved-data). |
| **Asset** | In Report Studio, a logo, image, signature or stamp a report may place. In the Data Catalog, a dataset, file or document type it lists. |
| **Attempt** | One go at a run. Retrying a failed run makes its next attempt; the run's page lets you switch between attempts. |

## B
| Term | Meaning |
|---|---|
| **Backfill** | Running a schedule once for each period of a past range, to fill a gap or catch up. See [Backfills](#trg-backfills). |
| **Brand profile** | A report's look in one place: header, footer, colours and logo, so every report matches. |
| **Bucket** | A storage container (for example on S3) that holds the workspace's files and the files runs write. |
| **Bulk approve** | Approving or rejecting several items at once, after seeing what will happen to each. See [Decide many at once](#apr-bulk). |

## C
| Term | Meaning |
|---|---|
| **Calls at once** | An AI or Call API step's setting: how many calls it makes at the same time. |
| **Check by hand** | A page a step read with low sureness, sent to a person to check beside its image. |
| **Condition** | A workflow step that sends a request one way or another depending on a value, such as a care plan's risk. |
| **Connection** | How the workspace reaches a storage bucket, a database, an API or a connector. See [Connect your storage](#con-storage). |
| **Connector** | A ready-made connection to a known service. |
| **Cost & usage** | The Billing tab that shows the month so far as the invoice will read it. |
| **Cron** | A timetable written as five fields: minute, hour, day of the month, month, day of the week. Read in server time (Chicago). |

## D
| Term | Meaning |
|---|---|
| **Dashboard** | A board of tiles over your pipelines' results, re-run each time it opens. See [Read a dashboard](#dash-boards). |
| **Data Catalog** | The list of the workspace's datasets, files and document types, what they hold and which fields are sensitive. See [The Data Catalog](#dash-catalog). |
| **Data contract** | What a record must look like: its fields, their types and which are required. Steps and the API check records against it. See [Data contracts](#con-contracts). |
| **Data level** | How sensitive a piece of data is (Sensitive, Internal or Public); it decides which models may see it. See [Which models may see which data](#ai-data-levels). |
| **Data policies** | The workspace's rules for its data: which models see each level, how long things are kept, whether bulk approve is allowed. See [Data policies](#sec-data-policies). |
| **Dataset** | A table of rows a run made or a form kept, which dashboards and analyses read. |
| **Document** | A file read into fields against a document type. |
| **Document type** | What a kind of document holds and how to read it: its fields and checks. See [Document types](#doc-types). |
| **DRAFT** | The mark on a model's answer: a draft for a person to check, never a decision. |
| **Due time** | When a task or approval should be decided; past it the task is overdue. |

## E
| Term | Meaning |
|---|---|
| **Email-in** | The workspace's own email address: attachments mailed to it become documents. |
| **Environment** | An API collection's set of variables, such as its base address, for one place it calls. |
| **Event** | A message from one of your systems that something happened, such as a lab result is ready. See [Events and event routes](#dev-events). |
| **Event route** | What an event type starts in the workspace: a pipeline's run or a workflow request. |
| **Extraction** | Reading a document's fields, with how sure the reading is of each. |

## F
| Term | Meaning |
|---|---|
| **File drop** | Dropping files into the workspace inbox, where they can start pipelines. See [The file drop](#doc-file-drop). |
| **Form** | Fields people fill in; a submission can start a pipeline, a workflow or both. See [Build a form](#form-build). |
| **Frequency** | How often a schedule runs: minutes, hourly, daily, weekly, monthly or a cron expression. See [Reference](#gl-reference--schedule-frequencies). |

## G
| Term | Meaning |
|---|---|
| **Generate report** | The step, or the action, that makes a report from a template and data. Every generate is a new version. |

## I
| Term | Meaning |
|---|---|
| **Inbox** | The workspace's storage place where dropped and uploaded files land, and where a file can start a run. |
| **Item** | One thing a run works on, such as a photo, a document, a recording or a patient, with how it went at each step. See [The Items view](#run-items). |
| **Items** | A run's tab listing its items, to find a failed one and retry only those. |

## K
| Term | Meaning |
|---|---|
| **Kept outputs** | What a run's steps kept (rows and files), which a retry reuses and which retention removes in time. |

## L
| Term | Meaning |
|---|---|
| **Lead** | The member of a team who may add and remove its members. See [Teams](#adm-teams). |
| **Library** | **Reports › Library**: every report and all its versions. |
| **Log** | A run's tab with every line its steps wrote, every try included. |

## M
| Term | Meaning |
|---|---|
| **Managed workspace** | A workspace whose pipelines and connections our team builds; its build screens are read-only for its own people. See [The managed service](#sec-managed). |
| **Managed session** | The recorded session in which our team works inside a managed workspace. |
| **Manager** | The person a member reports to; a workflow can send tasks or overdue work to them. |
| **Map** | A drawing of steps and how they connect: a run's **Map** tab, or an approval workflow's map. |
| **Masked** | A sensitive value hidden from someone whose access does not let them read it ("Masked for you"). |
| **Meter** | A count of something billed as it is used, such as runs, model tokens or pages read. |
| **Missed** | A run status: its time passed while nothing was running to take it. |
| **Model connection** | How the workspace reaches a model, hosted or on your own machines. See [Your models](#ai-models). |
| **My requests** | The requests you started, where each stands and its history. See [Start and follow a request](#apr-my-requests). |

## N
| Term | Meaning |
|---|---|
| **Notification** | A notice in the bell; **Notifications** lists them all. |

## O
| Term | Meaning |
|---|---|
| **OCR** | Reading text from page images; the step **Read text from pages** does it and says how sure it is. |
| **Out of office** | A period in which a colleague stands in for you and may decide your tasks, each decision recorded "for" you. See [Out of office](#adm-out-of-office). |
| **Outputs** | A run's tab with the files it kept, each with **View** and **Download**. |

## P
| Term | Meaning |
|---|---|
| **Page access** | Which pages and tabs a member may open; administrators open every page. See [Page access profiles](#adm-access-profiles). |
| **Page access profile** | A named set of pages and tabs, such as Clinician or Viewer, given to members. |
| **Page limit** | The most pages one report may have, 300 unless the workspace set fewer. |
| **Parameter** | A value a run is started with, such as a record number, that its steps read. See [Placeholders and run parameters](#pl-placeholders). |
| **Pass on** | Handing one task to a colleague, with a note; the history records it. |
| **Pipeline** | What a run does: the steps that read, check, transform, ask a model and write. See [What a pipeline is](#pl-overview). |
| **Placeholder** | A name in double braces, such as `{{mrn}}`, filled in from the row or the run. |
| **Platform administrator** | Our team's role across every workspace; works in a workspace's data only inside that workspace. |
| **Prompt** | The saved instructions an AI step sends to a model, with its answer's shape. See [Write and test a prompt](#ai-prompts). |

## Q
| Term | Meaning |
|---|---|
| **Queue** | A run status: due and handed to the engine, not started yet (the run's page says **Queued**). |

## R
| Term | Meaning |
|---|---|
| **Rate card** | The prices the workspace's usage is billed at, kept in versions with effective dates. |
| **Report** | A finished PDF and HTML document made from a template and data, with every version kept. |
| **Report Studio** | Where reports are designed, made, approved and signed: **See results › Reports**. See [Report Studio at a glance](#rs-overview). |
| **Request** | One case walking through an approval workflow, with its details and history. |
| **Retention** | How long each kind of data is kept before it is removed. See [Retention](#sec-retention). |
| **Retry** | Running a failed run again from its failed step, or only its failed items. See [When a run or a step fails](#ts-runs--retry). |
| **Review** | **Run & review › Review**: everything waiting for a person, with one count on the menu. See [Review](#apr-review-home). |
| **Role** | How much a person may do: workspace member, workspace administrator or platform administrator. See [Reference](#gl-reference--roles). |
| **Run** | One execution of a pipeline, with its steps, items, outputs and log. See [A run's page](#run-page). |
| **Run now** | Starting a schedule's run at once, by hand. See [Run now and Run with](#trg-run-now). |
| **Run pipeline** | A step, in a pipeline or a workflow, that runs another pipeline and can wait for its answer. See [Call another pipeline](#pl-run-pipeline). |

## S
| Term | Meaning |
|---|---|
| **Sandbox** | A separate test workspace for your systems' test keys; nothing there is billed. See [The sandbox and test keys](#dev-sandbox). |
| **Schedule** | When a pipeline runs: on a timetable, only when started, or when something arrives. See [Run a pipeline on a timetable](#trg-schedules). |
| **Scope** | What an API client may do, such as `runs:write`. |
| **Sensitive** | The data level for personal, health or confidential data. |
| **Signature** | In Report Studio, a person's approval applied to a PDF, which **Verify signature** checks; also a signature image placed in a report. |
| **Skip** | A run status: passed over on purpose, or because the last run was still in flight (the run's page says **Skipped**). For a step: it did not run because an earlier step failed. |
| **Source** | A named place a pipeline reads from. See [Sources and connectors](#con-sources). |
| **Standing in** | Deciding a colleague's task while they are out of office; the task shows **Standing in for** them. |
| **Step** | One action of a pipeline, such as Read S3, Validate or Generate report. See [Every step at a glance](#step-glance). |
| **Sub-item** | A part of an item, such as one page of a document, listed under it. |
| **Submission** | One filled-in form; **Forms › Submissions** lists them. See [Submissions](#form-submissions). |

## T
| Term | Meaning |
|---|---|
| **Tab** | One page of a menu entry with several, such as **Runs › Failed**; page access may grant tabs one by one. |
| **Task** | A workflow step for a person or a team to do and mark done, such as filling the triage form. |
| **Task Registry** | **Settings › Task Registry**: every task a step can run, and whether it is available here. |
| **Team** | A group of people that work can be sent to; whoever is free picks it up. See [Teams](#adm-teams). |
| **Template** | A report's design, made once and filled with data each time; published versions never change. |
| **Test sample** | Data kept with a template or pipeline for trying it out. |
| **Tile** | One chart, figure or table on a dashboard (also called a widget). |
| **Timeout** | The most seconds one try of a step may take. |
| **Trigger** | What starts a pipeline other than its timetable: a file, a document approved, a form, an event or a workflow. See [Three ways to start a pipeline](#pl-start). |
| **Tries** | How many times a step is tried before it fails. |

## V
| Term | Meaning |
|---|---|
| **Verify signature** | Checking a report's PDF, or a file someone sent you, is intact and one of the workspace's approved reports. |
| **Version** | A saved state of a pipeline, workflow, template or report; earlier versions are kept. See [Save, versions and history](#pl-versions). |
| **Void** | A report version marked as no longer stood behind, with a reason; it stays, and every copy served says VOID. |

## W
| Term | Meaning |
|---|---|
| **Webhook** | A call the platform makes to one of your systems when something happens, such as a run completed. See [Webhooks](#dev-webhooks). |
| **Workspace** | Your organisation's space in the console: its people, connections, pipelines, runs and bills; nothing crosses between workspaces. See [Your workspace](#adm-workspace). |
| **Workspace administrator** | The role that sets up a workspace: people, access, connections, pipelines, settings and bills. |
| **Workspace member** | The role that runs, reviews and reads, within the pages their profile opens. |
