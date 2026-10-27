---
id: con-api-versions
title: Versions and pinning
summary: Every save of a collection is a version; see who uses which, and pin a source to one so a later change cannot break it.
section: API collections
who: Anyone whose page access includes API collections reads versions and Used by; workspace administrators change collections and sources
where: Connections › API collections (/connections/api-collections); Connections › Sources (/connections/sources)
related: con-api-collections, con-sources, con-contracts
---
Every time a collection or one of its APIs is saved, the collection gets a new version: v1, v2, v3… The earlier ones are
kept. A caller either follows the **Latest** version or is **pinned** to one, so you can change an API without
surprising the pipelines that rely on it.

## See the versions
1. Open the collection. The **Version** tile and the line under its name show the current version.
2. Choose the **History** tab. Each version is listed with when it was saved; the newest is marked **current**.

![A collection's History tab](con-api-history "History: every save kept as a version, the newest marked current")

## See who uses which version
On the collection's **Overview**, **Used by** lists each pipeline, source and AI tool that calls one of its APIs:

| Column | Says |
|---|---|
| **Used by** | Pipeline, Source or AI tool |
| **Name** | Which one |
| **API** | The API it calls |
| **Pinned** | **Latest**, or the version it is pinned to, with **behind** when a newer one exists |

![Used by, with each pipeline and the API it calls](con-api-used-by "Used by: what calls each API, and whether it follows the latest version")

## Pin a source to a version
A source always names the version it runs:

1. Open **Connections › Sources**, open the source (or choose **New source**) and pick **Reads from: API**.
2. Pick the **Collection** and the **API**.
3. Pick the **Version**. The newest says **(current)**. A later save of the collection does not change the version the
   source runs.
4. Choose **Save**.

When you have changed the API and tested the new version, open the source again, pick the newer version and save.

## When a change would break something
Deleting an API, an environment or a whole collection that something still uses is refused. The console names what
uses it, in the same columns as **Used by**, with the version each one pinned and the version the collection is at now.
Move or remove those uses first.

> **Tip:** Change an API in steps: save the change (a new version), test it, then move the pinned sources one by one.
> Anything still on the older version keeps working meanwhile.

## Example
Summit Valley's lab partner changes how its order status answers. The administrator edits **Order status** in the
partner's collection and saves it: the collection moves from v4 to v5. The source "Open lab orders", pinned to v4, keeps
reading the old way. Once a test of v5 looks right, the administrator opens the source, picks **v5** and saves; **Used
by** then shows it on v5, and no run ever saw a half-made change.
