---
title: Connections and API collections
chapter: 4
part: Part II · Set up your workspace
icon: plug
blurb: Storage, read-only databases, API collections, data contracts and connectors.
paths: /connections
sections: Storage and databases | API collections | Contracts and sources | Good to know
---
Connections are where a workspace's data comes from and goes to: the buckets pipelines read and write, the databases
they may only read, the outside APIs they call, and the contracts the data must meet. Set them up once; pipelines,
sources, forms and the AI Assistant refer to them by name, and their secrets never come back to the browser.

## Start here
1. [Connect your storage](#con-storage) — Add a bucket or an FTP server, test it, and pick the one the file drop uses. ![](con-storage)
2. [Add a read-only database connection](#con-databases) — Let pipelines query a PostgreSQL database that the console only reads. ![](con-databases)
3. [Make an API collection](#con-api-collections) — Group the APIs you call, with their sign-in and environments. ![](con-api-collection)
4. [Page through results](#con-api-paging) — Fetch every page of a long answer, and stop in time. ![](con-api-paging)
5. [Test a request](#con-api-test) — Make one real call and read the answer before a pipeline relies on it. ![](con-api-request)
6. [Data contracts](#con-contracts) — Say what a record must hold, so a bad one is caught where it enters. ![](con-contract-panel)

## Questions
### Why can't I see the Storage tab?
Storage connections are a workspace administrator's: the tab shows only to them. Ask an administrator to add or change
one. See [Connect your storage](#con-storage).

### Can the console change data in our database?
No. A database connection is opened read-only, a query must start with SELECT, WITH, VALUES or TABLE, and results are
written to your storage, never back. See [Add a read-only database connection](#con-databases).

### Where do I put an API key or a password?
In an environment of the collection, as a variable marked **Secret**; the request or the default auth then says
`{{name}}`. A credential typed in plain text is refused. See [How an API signs in](#con-api-auth).

### My test says Blocked. What does that mean?
The address the call would reach is private, loopback, link-local or a cloud metadata address, so nothing was sent.
See [What the console may call](#con-addresses).

### Will changing an API break the pipelines that use it?
Every save is a new version. A source is pinned to the version it names, and **Used by** shows what follows the latest.
Test the change first. See [Versions and pinning](#con-api-versions).

### Can I bring in what we already have in Postman?
Yes: **Import** takes a Postman v2.1 collection with its environments, or a Bruno folder, as a new collection. See
[Import a Postman or Bruno collection](#con-api-import).

### A connector says "On request". How do I get it?
Its sign-in has to be registered for your platform first. Ask your account team. See
[Sources and connectors](#con-sources).

## Related
- documents
- pipelines
- steps
- security
- developers
