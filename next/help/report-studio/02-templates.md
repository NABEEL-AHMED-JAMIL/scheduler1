---
id: rs-templates
title: Templates and the library
summary: Find, start, copy, import, publish and archive templates; drafts and versions; the starters.
section: Get started
who: Anyone with Report templates; publishing needs Publish report templates
where: Reports › Templates (/reports/templates); Reports › Library (/reports/library)
related: rs-designer, rs-versions, rs-create
popular: Start a template from a starter
---
A **template** is a report's design: its layout, the data fields it reads and how it looks. It has **versions**. You
change a **draft**; when it is right you **publish** it as the next version, and that version never changes again.
Reports pin the exact version they were made from, so a report made in March still reads as it did in March after the
template has moved on.

![The Templates tab](rs-templates "Reports › Templates: the workspace's templates and the starters, as cards or a table")

## Find a template
1. Open **Reports › Templates**.
2. Narrow the list with the tabs **All**, **This workspace**, **Starters** and **Shared with me**, the search (name,
   description or tag), **All categories**, **All states** (Published, Never published, With a draft) and **Anyone**
   (Made by me, From a starter, Copies and imports). Tick **Archived** to see archived templates too.
3. Switch between **Cards** (a thumbnail of the first page) and **Table** (category, versions, origin, pages, updated).

## Start a template
- **From a starter.** On a starter card choose **Use starter**: it is copied into your workspace as a new template with a
  draft, ready to change. Starters are kept by the platform and labelled **Report Studio starter**.
- **From nothing.** Choose **New template**, give it a name, and the designer opens on an empty draft.
- **From another template.** In a template's menu (⋮) or on its page choose **Make a copy (new template)**.
- **From a file.** **Import JSON** reads a template another workspace exported with **Export JSON**.

## A template's page
Click a template's name to open its page. It shows the current published version or draft, **Test with data**, **Create
report**, its **Versions** (each with **Test** and **Copy**), its **Test samples** and **Data it needs**: the template's
data contract, every field it reads with its type and whether it is required.

![A template's page](rs-template-page "A template's page: versions, test samples and the data the template needs")

- **Edit draft** (or **New draft from vN**) opens the designer.
- **Discard the draft** throws the unpublished changes away; the published versions stay.
- **Archive** takes the template out of the lists and keeps it; reports made from it are not touched.
- **Delete template** is offered only for a template no report was ever made from.

## Publish
In the designer, **Publish vN** turns the draft into version N. If you may not publish, **Ask for approval** sends the
draft to the people who publish templates, in their **Review › Approvals**: they publish it there, or send it back
saying why. A workspace administrator decides who publishes, and whether **Publishing needs a second person**, in
**Reports › Settings** ([Approve, sign and verify](#rs-approve--who-approves)).

> **Tip:** Keep the test data you checked a template with: on its page or in the designer's test data, choose
> **Keep as a test sample**. The next person who changes the template tests it against the same data.

## Limits
| What | Limit |
|---|---|
| Components in one template | 500 |
| Items a **Repeat for each** lays out | 1,000 |
| Text in one text block | 10,000 characters |
| Published versions | as many as you publish; none is ever changed |
