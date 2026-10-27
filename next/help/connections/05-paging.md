---
id: con-api-paging
title: Page through results
summary: Page number, offset, cursor, Link header or a next URL in the answer; where the items are and when to stop.
section: API collections
who: Workspace administrators
where: Connections › API collections (/connections/api-collections)
related: con-api-collections, con-api-test, con-addresses
---
Many APIs answer a page at a time: 50 patients, then the next 50. Set an API's **Paging** once and every caller (a test,
a **Read API** step, a source) fetches page after page until there are no more, or until the most pages you allow.

## Set it up
1. Open the API and choose the **Settings** tab.
2. Pick the **Paging** mode the API's documentation describes (the table below).
3. Fill in the mode's fields. The panel says, under the mode, how it moves and when it stops.
4. Set **Items at**: where the list of items is in each answer, as a JSONPath from its root, such as `$.items` or
   `$.entry`.
5. Set **Most pages**, for example `10`, so a large answer cannot run on.
6. Choose **Save & test**, and read the test's line "N items over P pages".

![The Settings tab with Next URL in the answer](con-api-paging "Paging set to Next URL in the answer, with the JSONPath that finds the next page")

## The modes
| Mode | How it moves | What you fill in |
|---|---|---|
| **Page number** | Asks page 1, 2, 3… in a query parameter; stops on an empty or short page | **Page parameter** (`page`), **First page** (1), and if the API takes one a **Size parameter** (`limit`) with its **Page size** |
| **Offset** | Moves a skip parameter by the items received; stops at the total, or on an empty or short page | **Offset parameter** (`offset`), **First offset** (0), **Size parameter** and **Page size**, and optionally **Total at** (`$.meta.results.total`) |
| **Cursor** | Sends the cursor the last answer gave; stops when there is none | **Cursor parameter** (`cursor`) and **Next cursor at** (`$.next_cursor`) |
| **Link header** | Follows the `Link` header's `rel="next"`; stops when there is none | Nothing more |
| **Next URL in the answer** | Follows the next page's full address from the answer; stops when there is none | **Next URL at** (a JSONPath; filters work), or a **Next URL header** |

> **Note:** A next address stays on the first request's host. If the API sends you to another host for later pages,
> name it in **Other hosts** (host names only, comma-separated). Calls to another host are sent without this API's
> credentials.

## When something is wrong
The panel checks the settings before you save:

- A path starts with `$`, such as `$.items`.
- **Most pages**, a page size and a first page or offset are whole numbers.
- A **Size parameter** needs the **Page size** it sends.
- **Other hosts** are bare names, such as `api2.example.org`, without `https://` or a path.

If a test says "stopped at the page cap with more to fetch", there were more pages than **Most pages** allows. Raise it,
or narrow the request with a parameter.

## Examples
Summit Valley's public health APIs use four of the modes:

- **FHIR: patients** follows **Next URL in the answer** at `$.link[?(@.relation=='next')].url`, four pages at most in
  the "Patient 360 from the FHIR sandbox" pipeline.
- **openFDA: drug recalls** pages by **Offset** with `skip` and `limit` for the weekly drug-recall check.
- **ClinicalTrials.gov: studies** uses a **Cursor**, the answer's `nextPageToken`.
- The World Bank's health-spending indicators use **Page number** with `page` and `per_page`.

## Limits
| What | Limit |
|---|---|
| Most pages | A whole number, 1 or more |
| First page or offset | A whole number, 0 or more |
| Page size | A whole number, 1 or more |
| Other hosts | Public addresses only, sent without credentials |
