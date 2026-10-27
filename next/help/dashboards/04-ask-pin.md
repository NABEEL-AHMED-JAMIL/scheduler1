---
id: dash-ask-pin
title: Put an Ask your data answer on a board
summary: Ask a question in plain words, read the chart answer and its query, change the chart, and pin it to a dashboard as a widget.
section: Analysis
who: Anyone whose page access includes Ask your data; pinning needs Edit dashboards or Analytics Studio
where: See results › Analysis › Ask your data (/data/ask)
related: dash-boards, dash-build, dash-studio, dash-catalog
---
**Ask your data** answers questions about what you can open in the workspace: documents, forms, pipeline results and
datasets. When a question is about figures in a dataset, the answer is a query the console wrote and ran as you, drawn
as a chart with its rows beneath. That chart can become a widget on a board, which runs the same query every time the
board is opened.

The AI side of Ask your data (what it searches, which model answers, the search index) is in the AI topic. This
article is about using its chart answers.

## Ask and read a chart answer
1. Open **See results › Analysis › Ask your data**.
2. Type your question (up to 500 characters), or start from one of the suggestions under **Try:** or
   **Start with an example**, and choose **Ask**.
3. A question about figures comes back as:
   - a sentence answering it,
   - a chart of the rows (with **Change chart**, **Chart settings** and **Pin to dashboard** above it),
   - the rows as a table (the first 20 shown; the line under it says how many there were),
   - **The query, run as you over** the dataset's name: the exact statement that produced the rows.
4. **Open in Analytics Studio** opens the dataset on its SQL tab with that query, to change and save it.
   **Download CSV** saves the rows.

> **Warning:** The answer is written by a model. Read the query and the rows before you rely on the sentence above
> them: the rows are what the data holds, the sentence is a DRAFT.

## Change the chart
- **Change chart** lists the kinds **Suggested for this data**; **All charts, with a preview…** opens every kind.
- **Chart settings** sets the title, legend, colours, labels and number format.

## Pin it to a board
1. Under the chart, choose **Pin to dashboard**.
2. Check the **Title**: it becomes the widget's title.
3. Under **Dashboard**, pick **An existing dashboard** from the list, or **A new dashboard** and type its name.
4. Choose **Pin**. The panel says **Pinned to** the board; **Open the dashboard** takes you there.

![Pin to dashboard](dash-pin "Pin to dashboard: the widget's title, and an existing or a new dashboard")

The query is saved with the widget. It runs when the board is opened, as whoever opens it, so their masked fields stay
masked. **Pinned answers** on the Ask your data page lists what you pinned from here, each linked to its board.

> **Note:** If **Pin to dashboard** is greyed out, your access does not let you change dashboards. Ask your workspace
> administrator for **Edit dashboards**, or send the question to someone who has it.

## Example
At Summit Valley Health System, Jordan Reyes asks *Which ward was fullest last week?* The answer is a bar chart of
occupancy by ward from the operations figures, with the query beneath it. He changes it to **Horizontal bars**, pins it
to **Bed board** with the title *Fullest wards last week*, and the huddle sees it there every morning.
