---
id: con-sources
title: Sources and connectors
summary: What your pipelines read, sources you test and preview, and the ready-made connectors that sync data into your storage.
section: Contracts and sources
who: Anyone whose page access includes Sources or Connectors reads them; workspace administrators add sources and connections, and test and preview them
where: Connections › Sources (/connections/sources); Connections › Connectors (/connections/connectors)
related: con-storage, con-databases, con-api-collections, con-api-versions
---
Pipelines read data straight from their steps: a bucket and folder, an API, a database query, a document type. Two tabs
of **Connections** help around that: **Sources** shows what is read and lets you try a source before a pipeline
depends on it, and **Connectors** syncs data from other systems into your own storage, where pipelines pick it up.

## What your pipelines read
The top of **Sources**, **What your pipelines read**, lists every place the workspace's pipelines read, grouped by
place: **What** (a connection and path, an API, a database), its **Kind**, and **Read by** (the pipelines that read it,
each a link). There is nothing to set up: open a pipeline to change what it reads.

![What your pipelines read, on the Sources tab](con-sources "Places read: each storage folder, API and database, with the pipelines that read it")

## Make a source to test and preview
A source is a named place to read that you can test, preview and keep a schema for.

1. On **Sources**, choose **New source**.
2. Give it a **Name** and a **Description**.
3. Under **Reads from**, pick one:
   - **API**: a **Collection**, one of its **API**s, the **Version** it runs (see
     [Versions and pinning](#con-api-versions)), the **Environment** (empty: the collection's default) and **Rows at**,
     the JSONPath to the rows in the answer.
   - **File** or **Bucket folder**: a **Storage connection**, the **Format** (**CSV**, **JSON**, **JSON Lines** or
     **Parquet**), the **Path** inside the connection (a file for **File**, a folder for **Bucket folder**), and for CSV
     the **Delimiter** and whether **The first line is a header**.
   - **Database**: a **Database connection** and a **Query** that only reads.
4. Under **Try it**, choose **Test connection**, then **Preview** for the first rows and **Infer schema** to keep the
   schema they suggest.
5. Choose **Save**.

The list shows each source's **Kind**, **Format** and **Last test**: **Answered**, **Did not answer** or **not tested**.

> **Note:** Parquet is kept as a source's format but cannot be previewed yet; CSV, JSON and JSON Lines can.

## Connectors
**Connectors** is a gallery of ready-made connectors for databases, SaaS apps and files. Connect once, and the
connection syncs on a schedule into this workspace's own storage, under `connectors/`, where the Data Catalog, Sources
and pipelines find the data.

Each card says where it stands on your platform:

| On the card | Means |
|---|---|
| **Connect** | Ready: choose it to set one up |
| **Connected** | This workspace already has a connection |
| **On request** | Available once the platform's operator has registered the app's sign-in; ask your account team |
| **Not yet** | Not available yet; hover over it for why |

![The connector gallery](con-connectors "Connectors: databases, SaaS apps, files and APIs, with what each can do today")

To connect:

1. Choose **Connect** on a card, or **New connection** and pick the connector.
2. Give the connection a **Name** and pick **Write to**, the storage connection the synced data lands in.
3. Fill in what the connector asks for. For a SaaS app, saving sends you to that app to grant read-only access; come
   back when it asks you to.
4. Pick what to sync and how often under **Sync**, and save.

**Build custom (REST)** makes a connector over one of your API collections. The **Connections** table under the
gallery shows each connection's **Mode** (change capture, incremental or full refresh), **Last sync**, **Rows**, **Lag**
and **Status**, and **Schema change** when a change in the source waits for you.

## Example
Summit Valley's **What your pipelines read** shows the clinical bucket's `imaging/xray/images/` folder read by "X-ray
triage: model against the label" and `journey/wound/history.csv` read by the wound-photo pipelines. Before pointing a
new pipeline at the World Bank API, the administrator makes a source over it, previews the first rows and infers the schema.
