---
id: sec-health-data
title: Working with health data
summary: The controls the console gives you for patient data, starting with synthetic data, and what remains your organisation's to decide.
section: Records and audit
who: Workspace administrators, and everyone who handles patient data
where: Administration › Data policies (/administration/data-policies); Administration › Page access (/administration/access-profiles)
related: sec-data-policies, sec-ai, sec-retention, sec-audit, sec-sign-in
aliases: health-data
---
The console is built for healthcare data work and gives you controls for it: who opens what, how people sign in, which models may see sensitive data, which columns are masked, what a person must review, how long data is kept, and a record of who did what. How you set them is your organisation's decision.

> **Note:** Meeting your organisation's privacy and regulatory obligations depends on how you configure and use the console. The console does not by itself make a workspace compliant with any law or standard.

## Start with synthetic data
Build and try your pipelines with **synthetic** or **de-identified** records first. Move to real patient data only when your organisation has agreed how it will be handled, and who may see it.

Everything in this guide is synthetic: the Summit Valley Health System, its people, its patients (such as Elena Marsh), their records, images and numbers are made up. Some examples call public, keyless APIs or use public research images; none hold real patients' data.

## The controls, and where they are
| Control | Where | Article |
|---|---|---|
| Only the pages each person's work needs | **Administration › Page access** | [Page access profiles](#adm-access-profiles) |
| Strong sign-in, two-factor for clinicians | **Administration › Sign-in security**, a profile's **Require two-factor sign-in** | [Sign-in security](#sec-sign-in) |
| Sensitive data on local models only | **Administration › Data policies** | [Data policies](#sec-data-policies) |
| Patient identifiers masked for people without access | **Data Catalog** › **Scan for sensitive data** | [Masked columns](#sec-data-policies--masked-columns) |
| A person checks every model answer | Review on the pipeline; **Review** | [AI and your data](#sec-ai) |
| Data kept only as long as needed | **Data policies › Retention** | [Retention](#sec-retention) |
| A record of who did what | Sign-in history, Changes, Activity | [Audit](#sec-audit) |
| Our staff's access recorded | **Administration › Activity** | [The managed service](#sec-managed) |

## A checklist before real patient data
1. Profiles give each group only the pages it needs; the default profile is the narrowest (a Viewer).
2. Two-factor sign-in is required of administrators and clinicians.
3. Sensitive stays on **Local only**, or only on hosted connections your organisation has agreed in writing to use for it.
4. Every dataset and file with patient identifiers is scanned and its sensitive columns marked.
5. Pipelines that use a model hold their results for review.
6. Retention is set to your record-keeping policy, and previewed first.
7. Someone reads the access changes and sign-in history on a regular schedule.

> **Privacy:** Send a model only the fields it needs, and never paste patient details into a place that does not need them, such as a pipeline's name, a team's description or a reason field.
