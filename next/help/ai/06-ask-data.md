---
id: ai-ask-data
title: Ask your data, and chat with a file
summary: Questions in plain words with their sources or query, answers drawn as charts and pinned to a dashboard, and asking one file.
section: Ask and assist
who: Anyone whose page access includes Ask your data (and Files for the file chat); pinning needs dashboard editing; the search index is a workspace administrator's
where: See results › Analysis › Ask your data (/data/ask); See results › Analysis › Files (/data/files)
related: ai-assistant, ai-data-levels, ai-prompts
popular: Ask a question about your data
---
**Ask your data** answers a question in plain words from what you can open in this workspace: documents, forms,
pipeline results and datasets. Every answer shows where it came from, either its numbered sources or the query it ran,
so you can check it. The **file chat** does the same for one file.

![Ask your data](ai-ask-data "See results › Analysis › Ask your data: the question box, suggestions from your own data, examples and pinned answers")

## Ask a question
1. Open **See results › Analysis › Ask your data**.
2. Type a question, or pick one under **Try:** (made from what your workspace holds) or **Start with an example**.
   The badge at the top says what is searched, such as *Searching 3 documents, 7 pipeline results and 6 forms*.
3. Choose **Ask**. The answer comes in one of three shapes:
   - **From documents and forms**: the answer in words, with numbered citations; each source below it links to the
     document, form or file, with the passage it came from.
   - **From a dataset**: the answer, a chart, the rows behind it, and **The query, run as you** over that dataset.
     **Open in Analysis Studio** opens the query; **Download CSV** takes the rows.
   - **Not found**: it says it cannot find that in your data. Try naming a document, a schedule, a column or a value.
4. The line under each answer says which model answered, on which connection, and how long it took.

> **Note:** An answer is a DRAFT for a person to check, like any model's answer. Read the sources or the query before you
> use a number.

## Pin a chart to a dashboard
An answer drawn as a chart has **Pin to dashboard**. The pin becomes a tile that runs its query again whenever the dashboard
is opened, so it stays current. **Pinned answers** lists what you pinned from here. Pinning needs dashboard editing in your
page access; see also [Put an Ask your data answer on a board](#dash-ask-pin).

## Your recent questions
**Your recent questions** keeps what you asked in this browser; ask one again to get today's answer, or **Clear** the list.

## The search index (administrators)
With the **Search index** on, questions search your documents, forms and chosen folders by words and by meaning, so answers
keep up as they grow. Each person still finds only what they can open, and values the Data Catalog holds as sensitive are
stored masked. Pipeline results are always read live. With it off, every question reads your sources live.

## Chat with one file
1. Open **See results › Analysis › Files** and find the file.
2. From its row menu choose **Chat with this file**.
3. Pick the **Agent**: the prompts offered for this kind of file (a prompt whose **Tags** name the file type, such as
   *pdf*). Ask, or start from *Summarise this file*, *What are the key points?* or *List any dates mentioned*.
4. If the file is longer than the model can read at once, a note says how much of it the answers cover; a large file may
   be answered from the passages most relevant to each question.
5. **Close** ends the chat. The conversation is deleted and the text read from the file is dropped: nothing is kept.

## Example
Summit Valley's operations director asks *What is the average length of stay by ward this month?* The answer is drawn as a
bar chart from the ward census results, with the query beside it; Jordan Reyes pins it to the *Patient journey* dashboard.

## Limits
| What | Limit |
|---|---|
| One question | 500 characters |
| What is searched | Only what you may open in this workspace |
| Recent questions | Kept in this browser, for you |
