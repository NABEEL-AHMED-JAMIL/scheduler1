---
id: con-storage
title: Connect your storage
summary: Add an S3, MinIO, Azure Blob, FTP or FTPS connection, test it, and choose which one the file drop uses.
section: Storage and databases
who: Workspace administrators (the Storage tab is theirs alone)
where: Connections › Storage (/connections/storage); Documents › Intake › File drop (/documents/intake/file-drop)
related: con-databases, con-addresses, doc-file-drop, con-sources
popular: Connect your storage
aliases: data-in
---
A storage connection is a bucket or a server folder that this workspace's pipelines read from and write to: input
files, the results a run keeps, the files that arrive in the file drop, the reports it makes. Everything else in
**Get data in › Connections** builds on it, so a new workspace usually starts here.

**Connections** has six tabs:

| Tab | What it holds |
|---|---|
| **Connectors** | Ready-made connectors that sync a database, an app or a folder into your storage |
| **Storage** | Buckets and FTP servers (this article) |
| **Databases** | Read-only database connections |
| **API collections** | The APIs your pipelines call, with their sign-in and environments |
| **Sources** | What your pipelines read, and sources you test and preview |
| **Data contracts** | The shape the rows you receive must have |

![The Storage tab with four connections, each tested OK](con-storage "Connections › Storage: each connection's alias, provider, target, credentials and last test")

## Add a storage connection
1. Open **Get data in › Connections** and choose the **Storage** tab.
2. Choose **New storage connection**.
3. Pick the **Provider**: **MinIO**, **AWS S3**, **Azure Blob**, **FTP** or **FTPS**. The fields below change with it.
4. Give it a **Name** people will recognise and an **Alias**. The alias is how pipelines refer to the connection:
   letters, numbers, `.`, `_` and `-` only.
5. Fill in where the files are:
   - **AWS S3** and S3-compatible services: the **Bucket** (choose **Discover** to pick from the buckets the key can
     see), the **Region**, and an **Endpoint** only for an S3-compatible service that is not AWS.
   - **MinIO**: the **Endpoint** and the **Bucket**.
   - **Azure Blob**: the **Container**, then either a **Connection string** or an **Account name** with its
     **Account key**.
   - **FTP** and **FTPS**: **Host**, **Port**, **Username**, **Password** and a **Base directory** everything is read
     relative to. Tick **Passive mode** if your server needs it; for FTPS, **Implicit TLS (port 990)**.
6. Give the credentials: **Access key** and **Secret key** for S3 and MinIO.
7. Leave **Status** at **Active** and choose **Create**.

![The New storage connection dialog with AWS S3 picked](con-storage-new "New storage connection: provider, name and alias, the bucket, and the keys")

> **Privacy:** Passwords, secret keys and connection strings are encrypted and never sent back to the browser. When you
> edit a connection, leave a secret field blank to keep the stored one. The **Credentials** column says **Stored** or
> **Not stored**.

> **Warning:** Plain **FTP** sends the user name and password unencrypted. Use **FTPS** or a bucket where you can.

## Test it
Open the connection's menu (⋮) and choose **Test connection**. The **Last test** column shows **OK** or **Failed**
with the time; hover over a failed test to read why. To test several at once, tick them and choose **Test selected**.

The tiles above the list count the connections **In service** (Active), **Tested OK**, **Failing** and **Untested**.
Test a connection after you create it and whenever its keys change.

## Copy, switch off or delete one
- **Clone…** copies everything from a connection except the bucket: give the copy a new name, a unique alias and its
  bucket. The stored keys come along, so the copy works at once.
- **Edit** and set **Status** to **Inactive** to stop pipelines using a connection without deleting it.
- **Delete** removes it. Pipelines that name its alias stop finding it, so check what uses it first.

## The file drop's connection, folder and size limit
Files people drop on **Documents › Intake › File drop** are stored in one of your storage connections, the
workspace's default place for arrivals. An administrator picks it under **Settings › Change** on the file drop:

- **Storage connection**: one of this workspace's own connections.
- **Where files land**: under `intake/` in that bucket, as `intake/<date>/<arrival>-<file name>`.
- **Size limit (MB)**: optional. Empty means the platform's own limit, which the dialog shows; a number lowers it for
  this workspace.

See [The file drop](#doc-file-drop) for the rest.

> **Tip:** Give each workspace its own bucket. A bucket shared between workspaces lets one workspace's runs write where
> another's read.

## Example
Summit Valley Health System keeps four S3 connections: **Summit Valley: files (default, inbox)** (alias
`summit-valley-s3`) takes the file drop's arrivals with a 25 MB limit; the clinical, finance and open-data files each
have a bucket of their own, so a pipeline that reads finance files never sees an X-ray.

## Limits
| What | Limit |
|---|---|
| Who may add, change, test or delete | Workspace administrators |
| Alias | Letters, numbers, `.` `_` `-`; unique in the workspace |
| Addresses | Endpoints must be public: see [What the console may call](#con-addresses) |
| File drop size | The platform's limit per file, or a lower one you set |
