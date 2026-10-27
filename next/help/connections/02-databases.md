---
id: con-databases
title: Add a read-only database connection
summary: Connect a PostgreSQL database that pipelines and sources may only read, and why the console never writes to it.
section: Storage and databases
who: Workspace administrators add, test and change connections; anyone whose page access includes Connections › Databases sees the list
where: Connections › Databases (/connections/databases); Connections › Sources (/connections/sources)
related: con-storage, con-sources, con-addresses
---
A database connection lets a pipeline's **Read Database** step, or a database source, run a query against one of your
own databases. The console reads only: it connects read-only, accepts only a query that reads, and keeps what it reads
in your storage. Today a database connection is PostgreSQL.

![The Databases tab with one read-only PostgreSQL connection](con-databases "Connections › Databases: host and database, the user, whether a password is set, TLS and state")

## Add a connection
1. Ask your database team for a user that can only read the tables you need. This is the most important step: the
   console never needs more.
2. Open **Get data in › Connections › Databases** and choose **New connection**.
3. Fill in **Name**, **Host**, **Port** (5432 unless yours differs), **Database** and **User**.
4. Pick **TLS**: **Required**, **Preferred** or **Off**. Choose **Required** for any database outside your own network.
5. Type the **Password**. It is sealed as it arrives and never shown again.
6. Choose **Test connection**. The console connects and reads nothing; the dialog says whether it worked.
7. Choose **Create**.

![Editing a database connection: host, database, user, TLS and a stored password](con-database-dialog "The connection dialog: the password shows only as configured, with Replace")

To change the password later, open the connection (or **Edit or replace password** in its menu), choose **Replace**
and type the new one. Choose **Keep** to change your mind.

## What "read-only" means here
- **The connection reads.** The console opens it read-only and only to run a query.
- **The query reads.** A source's or a step's query is one statement that starts with `SELECT`, `WITH`, `VALUES` or
  `TABLE`. Anything else is refused before it runs.
- **The rows are capped.** A query returns at most the rows it asks for, so a preview never pulls a whole table.
- **Results go to your storage.** What a pipeline makes from the rows (a file, a report, a dataset) is written to the
  workspace's storage connections, never back to the database.

## Why the console never writes to your databases
Your databases are the systems your organisation runs on: the clinical record, the ledger, the shop. A pipeline that
could write to them could change a patient's chart or a balance by mistake, and nobody would see it in a review. So the
console has no step that writes to a customer database, and the user you give it should not be allowed to either. Its
results live in your storage, in datasets and in reports, where people review them first.

> **Tip:** If a system must receive a result, send it through that system's own API with an API collection and a
> **Call API** step, where the system checks what it accepts.

## Use it
- In a pipeline, add a **Read Database** step and pick the connection.
- On **Connections › Sources**, a source of kind **Database** names the connection and the query, so you can test it,
  preview its first rows and infer its schema. See [Sources and connectors](#con-sources).

## Example
Summit Valley's **Store systems (read-only)** connection signs in to the pharmacy shop database as `demo_reader`, a user
allowed `SELECT` and nothing else. The hourly pipeline "Pharmacy store orders from the shop database" reads the new
orders with a **Read Database** step and writes sales by store and category to the retail folder of its bucket.

## Limits
| What | Limit |
|---|---|
| Databases | PostgreSQL |
| Query | One statement starting with SELECT, WITH, VALUES or TABLE |
| Port | 1 to 65535 |
| Who may add, test, change or delete | Workspace administrators |
| Addresses | See [What the console may call](#con-addresses) |
