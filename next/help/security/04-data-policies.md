---
id: sec-data-policies
title: Data policies
summary: The three data levels, which models may see each, masked columns, how long run files are kept, and bulk review switches.
section: Your data
who: Workspace administrators change them; members who use the AI Assistant can read the policy
where: Administration › Data policies (/administration/data-policies); See results › Analysis › Data Catalog (/data/catalog)
related: ai-data-levels, sec-retention, sec-ai, sec-health-data
popular: Choose which models may see sensitive data
---
**Data policies** says, for each level of data, which models may see it, how long a run keeps its working files and whether the AI Assistant may change things with it. The same page holds the workspace's **Bulk review** switches and its **Retention**.

![Administration › Data policies](sec-data-policies "Data policies: Sensitive, Internal and Public, each with its model rule and settings")

## The three levels
| Level | What it is | Default model rule |
|---|---|---|
| **Sensitive** | Personal, health or confidential data | **Local only** |
| **Internal** | The workspace's everyday data; a call is internal when nothing says otherwise | **Any model** |
| **Public** | Data anyone may see: published figures, open datasets and APIs | **Any model** |

Until you save a level, its defaults apply and the page says **Not saved yet — these are the defaults**. A prompt declares its level, a pipeline may declare one in its settings, and an API collection or a data contract has one of its own. A call's level is the highest level known of it.

![How a call's level is decided](sec-level-rule "How a call's level is decided")

## Choose which models may see sensitive data
1. Open **Administration › Data policies**.
2. In the **Sensitive** column, under **Model rule**, choose:
   - **Local only**: only models running on your own machines; the data never goes to a hosted provider;
   - **BAA-signed hosted, or local**: local models, and hosted models only on a connection marked as covered by a signed Business Associate Agreement;
   - **Any model**.
3. Under **Allowed models**, tick connections or single models to narrow it further. None ticked: any model the rule allows.
4. Set the other rows if you need to:
   - **Keep run files**: days (1 to 3,650) a run keeps this level's working copies; blank means the pipeline's own (24 hours unless it sets another);
   - **AI write tools**: whether the AI Assistant may run pipelines, create PDFs, save or delete files and call APIs that change data (it still asks first). Off for Sensitive by default;
   - **Minimum-fields warning**: reminds whoever builds a step to send a model only the fields it needs.
5. Choose **Save policy**. **Use the defaults** puts a level back.

More on the model rules: [Which models may see which data](#ai-data-levels).

## Masked columns
Columns marked sensitive in the **Data Catalog** (patient identifiers, names, contact details) are masked for anyone without access: in the catalog, in Analytics Studio, on dashboards and in their exports, and in Ask your data.
- Open a dataset or file in **See results › Analysis › Data Catalog** and choose **Scan for sensitive data**, or mark columns by hand.
- A person who needs the values opens the asset, types **Why you need it**, picks **For** (1, 7, 30 or 90 days) and chooses **Request access**. A workspace administrator decides in **Review**.

![A masked asset in the Data Catalog](sec-masked "For a researcher, the medical record number is marked Sensitive and the asset's values are masked")

## Sensitive files
Masking changes what a screen shows, not the files a sensitive pipeline keeps. Viewing or downloading those files (a
saved file, an item's files, a report's PDF) needs **Download sensitive files** on the person's access profile; without
it they see the file's name, size and type and a lock. See [The Items view](#run-items--sensitive-pipelines).

## Bulk review
Whether reviewers may approve many runs or documents in one decision. Each item is still decided and recorded on its own, and rejecting in bulk is always allowed.
- **Allow bulk approve of runs**: off, runs are approved one by one.
- **Allow bulk approve of documents**, and under it **Include documents whose rules fail** (off by default: such a document is skipped and approved on its own screen; on, the failures are accepted and the override is recorded on each).

Choose **Save review policy**. A pipeline can still require individual review in its own settings.

![Bulk review](sec-review-policy "Bulk review: the switches for runs and documents")

## Example
Summit Valley keeps Sensitive on **Local only**, so its clinical prompts run on its own local models. Its Researcher profile sees the columns marked sensitive, such as the medical record number, masked; Dr. Hana Ito requests 30 days' access for an approved study and an administrator decides.
