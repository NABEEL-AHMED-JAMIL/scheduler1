# The help centre and the client book: the source

One source, two outputs (owner, 2026-10-26):

- **The help centre** (`/docs` in the console). `node scripts/build-help.mjs` checks this folder and writes
  `public/help/content.json`, which the help page fetches; it parses each article with
  `src/app/features/docs/help-markdown.ts`. `help-content.spec.ts` fails when the JSON is older than the Markdown.
- **The client book** (the PDF, `etl-platform/docs/showcase/guide-outline.md`). A topic is a chapter (its `chapter:`
  number), its articles are the chapter's sections in file order, a `##` part is a how-to or a sub-section, and the
  figures are the same files. The book's build reads this folder (or the generated JSON) and only lays it out.
- **The AI Assistant's help search** (ai-service `scripts/gen-help-index.mjs`) reads the generated JSON.

Screenshots: `public/help/img/<name>.webp`, taken by `node scripts/help-screenshots.mjs` from each topic's `shots.json`
at 1920 × 1080, light, device scale 2 (the book's size; the help centre shows them at half). `figures.json` beside them
records each one's size, where it was taken and who as, and `retake` where a shot waits for better data.

## A topic: `help/<topic-id>/_topic.md`

```
---
title: Report Studio
chapter: 13
part: Part VI · See results
icon: template
blurb: Templates, generated reports, approval and digital signatures.        (one line, on the topic's card)
paths: /reports/overview, /reports/templates, /reports/library             (the pages it is about: who may open one sees it)
sections: Get started | Design | Data | Generate | Approve and sign | Manage | Help
---
A short summary for the topic's page: two or three sentences, what this part of the product is for.

## Start here
1. [Pick a template](#rs-templates) — Start from a starter or your own. ![](rs-templates)
2. [Lay it out](#rs-designer) — ... ![](rs-designer)

## Questions
### Why can't I approve my own report?
The answer, in Markdown. Link the article that says more: [Approve and sign](#rs-approve).

## Related
- dashboards
- approvals
```

Start here has 3 to 6 steps, each linking the article that does it and naming a figure. Questions are the topic's
popular questions (4 to 8). Related names other topics by id.

## An article: `help/<topic-id>/NN-<slug>.md`

```
---
id: rs-designer                      unique across the help; the address is /docs#rs-designer
title: Lay out a template in the designer
summary: Components, data fields, page settings, undo and autosave.     (one line: cards, search, the book's contents)
section: Design                      one of the topic's sections
who: Anyone whose page access includes Reports › Templates; publishing may need a workspace administrator
where: Reports › Templates (/reports/templates); Reports › Library (/reports/library)
related: rs-ai-designer, rs-data
popular: Add a chart to a report     (optional: listed as a popular how-to)
aliases: reports                     (optional: older addresses that open this article)
---
What it is for, in a paragraph or two.

## Lay out a page
1. Open **Reports › Templates** and choose **New template**.
2. ...

![The designer with a chart selected](rs-designer "The designer: components on the left, the page, settings on the right")

> **Tip:** ...
> **Note:** ...
> **Warning:** ...
> **Privacy:** ...

## Limits
| What | Limit |
|---|---|
| Components in one template | 500 |
```

Rules for the words:

- **Readers** are customer administrators, analysts and reviewers, not engineers. Plain language. Never internal ids,
  service names, decision-record numbers, code paths, step codes (`generate_report`) or ticket numbers.
- **The console's own names**, exactly as the screen shows them, in bold: **Reports › Templates**, **New template**,
  **Approve and sign**. Check the live screen or its template; never guess a label.
- Each article: what it is for; steps with the exact names; tips and warnings; limits (sizes, pages, retention,
  permissions) where there are any; an example (the showcase's Summit Valley Health System, or a generic one); related
  articles. Every example person, patient and number is fictional.
- Links: `[text](#article-id)` or `[text](#article-id--part)` for the help, `[text](/console/path)` for a console page.
- Figures go on a line of their own: `![What it shows](name "Caption")`; the name is a file in `public/help/img`
  without `.webp`, made by a `shots.json` entry of the same name.
- Copyable text (an address, a placeholder, a cron line) goes in a fence whose first line names it: ` ```A cron line `.
- `<!-- widget: menu-map -->` draws the live menu (the Reference article). Other comments are dropped.
