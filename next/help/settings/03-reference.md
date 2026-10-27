---
id: set-reference
title: Configuration values, home pages, task groups and topics
summary: A short reference for the values and secrets pipelines read at run time, the home pages and groups a task can name, and the Kafka connections and topics.
section: Settings
who: Workspace administrators
where: Administration & billing › Settings › Configuration values (/settings/values); Administration & billing › Settings › Home pages (/settings/home-pages); Administration & billing › Settings › Task groups (/settings/task-groups); Administration & billing › Settings › Kafka & Topics (/settings/kafka)
related: set-registries, set-alerts
---
Four short lists under **Settings** hold things pipelines name rather than contain: a value or a secret, a web
address, a group label, a broker and its topics. Keeping them here means they are written once and changed in one
place.

## Configuration values
**Configuration values** are values and secrets a pipeline reads when it runs, per workspace: a bucket name, a
database password. A pipeline's settings name an entry instead of holding it:

```A configuration value and a secret, as a pipeline names them
${config:BUCKET_NAME}
${secret:DB_PASSWORD}
```

The real value is fetched when the run starts; the pipeline's settings and its logs only ever carry the reference.

![How a pipeline names a value](set-values "Configuration values: how a pipeline names a value or a secret, and which settings must hold a secret")

1. Choose **New value**.
2. Pick the **Workspace** (only its pipelines can use the entry), type the **Key** (capital letters, digits and
   underscores, a letter first, up to 64 characters), and pick the **Kind**: a value or a secret.
3. Type the **Value**, or the **Secret**, and a **Description**.
4. Save. The figures at the top count the **Values**, the **Secrets** and those **In use**; **Used by** names the
   pipelines that reference each one.

> **Warning:** A secret is stored encrypted and never shown again, not here and not to anyone. To change it, type a
> new one.

A setting whose name looks like a credential (password, secret, token, API key, access key, private key, client
secret) must hold a `${secret:…}` reference. A pipeline that writes the credential itself there, or names a key the
workspace does not have, is refused when it is saved.

## Home pages
**Home pages** are web addresses a task can name as its home page: where a person goes to see what the task feeds
(a report site, a partner's portal). Choose **New home page**, give it a **Name** (what a task's list shows, unique in
the workspace), its **Address** and a **Description**, then pick it on a task.

## Task groups
**Task groups** are labels that group tasks together. Choose **New task group**, give it a **Name** and, if you like,
a **Value** and **Description**; a task then picks it in its **Group** field. **Used by** shows the tasks in each.

## Kafka & Topics
**Kafka & Topics** shows, live, the message brokers your pipelines publish through: whether they answer, whether your
topics exist, who reads each topic and how far behind they are.

- With no connection of its own, the workspace publishes through the platform's default broker, and the page says so.
- Choose a connection on the left to see its **Topics**, **Consumer groups** and **Connection**; **Recheck** reads them
  again. A topic nobody reads says **No consumer**.
- **New connection** adds a broker of your own; **Add topic** adds a topic. Secrets are encrypted and never sent back
  to the browser.

## Example
Summit Valley Health System keeps its finance bucket's name as `${config:FINANCE_BUCKET}` and its store database
password as `${secret:STORES_DB_PASSWORD}`. When the database password changed, the administrator typed the new secret
once, and every pipeline that reads the store systems used it from the next run.
