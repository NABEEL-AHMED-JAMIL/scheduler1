---
id: dash-boards
title: Read a dashboard
summary: Open a board, run its widgets, narrow it with the date range and filters, and share it with people in your workspace.
section: Dashboards
who: Anyone whose page access includes Dashboards; changing a board needs Edit dashboards (or Analytics Studio)
where: See results › Dashboards (/data/analytics/dashboards)
related: dash-build, dash-data-sources, dash-ask-pin, dash-catalog
popular: Filter a dashboard by date
aliases: results
---
A dashboard is a page of widgets (tiles) over your pipelines' results: figures, charts and tables. Nothing on a board is
a stored picture. Each widget points at a saved analysis or a saved query, and runs it again every time the board is
opened, so the board always shows what the files hold now, read as the person looking at it.

## Find a board
1. Open **See results › Dashboards**.
2. The cards are grouped: your **Favourites** first, then one group for each pipeline that feeds boards (the group is
   the pipeline's name), then **Not fed by a pipeline**. Each card shows the board's name, how many widgets and files it
   has, its description, who made it and when it was last updated.
3. With more than six boards, type in **Find a dashboard** to narrow the cards by name or description.
4. Choose a card to open the board.

To keep a board at the top, choose the star on its card (**Add to favourites**). Favourites are yours and are kept in
this browser.

![The dashboards list](dash-list "Dashboards: favourites first, then the boards grouped by the pipeline that feeds them")

## Read a board
The line under the board's name says what you are looking at: the number of widgets and files, who made it,
**Made by** (the pipeline and run that wrote its files, linked to the run), **Last run** (how many widgets drew, and
how many failed) and how long the board took to load.

- **Run every widget** runs the whole board again; **Stop** stops it. Each widget also has its own refresh button.
- A widget's foot says how many rows it drew and when it ran. **Show all** opens rows a chart had to leave out, and
  **Open every row in a window** (in the widget's ⋯ menu) shows a long result in full.
- A table widget pages, sorts and filters on the server: use **Search the rows**, **Columns** and **Export CSV** on
  the widget itself.
- **Files this board reads** (folded under the facts line) lists every file the widgets read.
- A widget that cannot draw says why in its own tile, with **Try again**. The rest of the board still draws.

![A board](dash-board "A board: the facts line, Run every widget, and figures, a gauge and tables read from the pipeline's files")

![The same board in Dark](dash-board-dark "The same board in the Dark theme: every widget follows the theme each person picks")

> **Note:** A widget that shows **Partial result — stopped at the server's row ceiling** read only part of its data.
> Ask the board's editor to narrow its query, or open the file in [Analytics Studio](#dash-studio).

## Narrow it with the date range and filters
A board whose editor added a **filter bar** shows it above the widgets: a date range first, then one chip for each
filter (for example **Department** or **Ward**), then **Clear all**.

1. Pick a range: **30 days**, **90 days**, **12 months**, **This year**, **All time**, or **Custom** for your own
   **From** and **To** dates.
2. Open a filter chip and tick the values you want. Only the values you set narrow the board.
3. Every widget whose data has that column runs again, narrowed. It shows **Filtered** in its foot. A widget whose data
   has no such column says **Not by** and the filter's name, and keeps showing everything.
4. **Clear all** puts the board back.

Your choice is kept in the board's address and in this browser, so the board opens the way you left it.

You can also narrow a board without a filter bar:

- **Click a bar or a slice** on a chart: the board is filtered to that value at once.
- Or choose ⋯ › **Filter this board**, pick the dataset under **Filter the widgets that read**, build the conditions,
  and press **Apply to the board**. Nothing runs again until you press it.

The facts line then shows **N filters on**. Choose it to see the filter, or the × beside it to clear it.

## Share a board
A board belongs to the workspace, so everyone in it whose page access includes **Dashboards** can open it.

1. Open the board, filtered the way you want it.
2. Copy the address from your browser and send it to a colleague.
3. They sign in and see the same board with the same filters. Their widgets run as them: a column the Data Catalog
   holds sensitive stays masked for anyone without access to it.

> **Privacy:** A board link never works without signing in, and a link to another workspace's board says
> **This dashboard isn't here**.

## Who may do what
| Who | May |
|---|---|
| Page access **Dashboards** | Open, run and filter every board, and export a table widget |
| **Edit dashboards**, or **Analytics Studio** | Also make, change and delete boards, and pin answers to them |
| **Analytics Studio** | Also read a file's rows outside a board, and write queries of their own |

Someone with **Dashboards** alone sees: *You can open, run and filter these dashboards. Changing them needs the Edit
dashboards page, and reading data outside their tiles needs Analytics Studio.*

## Example
At the morning huddle Jordan Reyes, operations director at Summit Valley Health System, opens **Bed board**, sets the
range to **30 days** and clicks the bar for ward 4B on **Occupancy by ward (%)**. Every widget narrows to 4B. He copies
the address into the huddle notes, and Rosa Alvarez, the charge nurse, opens the same view.
