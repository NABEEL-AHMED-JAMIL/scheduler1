---
id: con-api-import
title: Import a Postman or Bruno collection
summary: Bring a Postman v2.1 collection (with its environments) or a Bruno folder in as a new API collection, and read the import report.
section: API collections
who: Workspace administrators
where: Connections › API collections (/connections/api-collections)
related: con-api-collections, con-api-auth, con-api-test
popular: Import a Postman collection
---
If a partner or your developers already keep their APIs in Postman or Bruno, import them instead of typing each request
again. The import makes a new API collection with the requests, folders, variables and sign-in it could carry over,
and a report of what needs a look.

The files are read in your browser and nothing in them is run: a Postman script or test never runs here.

## Import from Postman
1. In Postman, export the collection as **Collection v2.1** (a `.json` file). Export its environments too if you want
   them.
2. Open **Get data in › Connections › API collections** and choose **Import**.
3. Keep **Postman** selected and, under **Collection file**, choose **Choose file** and pick the collection.
4. Optionally, under **Environment files**, choose **Choose files** and pick the environments. Each becomes an
   environment of the collection; its secret values are sealed on arrival.
5. Optionally give the collection a **Name**; empty keeps the name the file gives it.
6. Choose **Import**.

![The Import a collection dialog](con-api-import "Import a collection: Postman or Bruno, the files, and an optional name")

## Import from Bruno
1. Choose **Import**, then **Bruno**.
2. Under **Bruno collection**, choose **Choose folder** and pick the collection's folder, or **Choose .bru files** to
   pick files. Files other than `.bru` and `.json` are left out.
3. Optionally give it a **Name**, and choose **Import**.

## Read the import report
When it is done, the dialog becomes the **Import report**:

| Count | Means |
|---|---|
| **Imported** | Came across as it was |
| **Converted** | Came across, changed to fit how the console works; the note says how |
| **Needs a look** | Came across, but check it before you use it |
| **Skipped** | Left out, with the reason |

The table below lists each item with a note, those that need you first. "Imported as a new collection. Nothing needs a
look." means you can go straight on. Choose **Open collection**.

## After the import
1. Open each environment and check its variables. Replace any secret that came across empty.
2. Check the collection's **Default auth** (**Edit details**) and each API's **Auth** tab. See
   [How an API signs in](#con-api-auth).
3. Test each API against a sandbox. See [Test a request](#con-api-test).

The collections list counts imports in its **Imported** tile, and the **Source** column says **Postman** or **Bruno**.

> **Note:** Each import makes a new collection; it never changes one you already have. To bring in a partner's newer
> export, import it again (it arrives as a separate collection), compare, and move your pipelines across when it is
> tested.

## Example
Summit Valley's lab partner sent its order API as a Postman collection. The administrator imported it as **Northgate
Labs partner (imported)**: three APIs (**Place a lab order**, **Order status**, **Cancel an order**) and one environment
whose `baseUrl` points at the partner's sandbox. When the partner sent a newer export, it came in alongside as
**Northgate Labs partner (imported v2)**.
