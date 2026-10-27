---
id: dash-build
title: Build and edit a dashboard
summary: Make a board, add widgets from saved analyses and queries, choose each chart, set widths and sections, and add a filter bar.
section: Dashboards
who: Anyone whose page access includes Edit dashboards or Analytics Studio
where: See results › Dashboards (/data/analytics/dashboards)
related: dash-boards, dash-data-sources, dash-studio, dash-ask-pin
popular: Add a chart to a dashboard
---
A board is built from work already saved: an **analysis** or a **query** saved in [Analytics Studio](#dash-studio), or
an answer pinned from [Ask your data](#dash-ask-pin). A widget points at that saved work and never keeps a copy of its
result, so changing the saved query changes every widget that uses it.

## Make a board
1. Open **See results › Dashboards** and choose **New dashboard**.
2. Give it a **Name** (for example *Bed board*) and, if you like, **What it is for (optional)**: the line every card and
   the board show under the name.
3. Choose **Create**. The board opens empty, with **Add a widget**.

## Add a widget
1. On the board, choose ⋯ › **Add a widget**.
2. Fill in **Title**.
3. Under **Shows**, pick **A saved analysis** or **A saved query**, then pick **Which one**. It runs once, so you can
   see it.
4. Under **Drawn as**, point at a chart kind: the widget's own result is drawn in that kind as you move over it. Kinds
   that cannot draw this result say why; **Only what fits** hides them, and **Search chart types** finds one by name.
5. Optionally set **Height** (in pixels) and a **Caption**: what the reader should take from it.
6. Choose **Add**. Only the new widget runs, not the whole board.

![Adding a widget](dash-add-widget "Add a widget: what it shows, its title and height, and the chart kinds drawn with its own result")

> **Tip:** If the list under **Which one** is empty, save an analysis or a query in Analytics Studio first: a widget has
> nothing else it can point at.

## Change a widget
Open the widget's ⋯ menu:

- **Choose a chart, with a preview…** opens every kind with the widget's result drawn in it.
- **Suggested for this data** lists the kinds that suit the result; **All charts** lists every kind by category, with
  **Search charts** to find one by name.
- **Chart settings…** sets the widget's **Title** and **Subtitle**, its **Legend**, **Colours**, **Data labels**,
  **Tooltip**, **Number format**, and **Sort and top N** (with **Add the rest as "Other"**), with a preview.
- **Width**: **Auto**, or 3/12 (a quarter), 4/12 (a third), 6/12 (half), 8/12 (two thirds), 9/12 (three quarters) or
  12/12 (the whole row). On Auto a single figure takes a quarter, a chart half and a table the whole row.
- **Start a section here** puts a heading (and an optional description) above the widget; the section starts a new
  row. **Edit the section heading above** changes it; an empty heading removes it.
- **Remove from board** takes the widget off. The saved analysis or query it pointed at is kept.

![Choose a chart](dash-kind-picker "Choose a chart: every kind by group, with the widget's own result drawn in the one under the pointer")

### The chart kinds
There are 52 kinds in eleven groups: **Figures and tables** (a single figure, a figure with its trend, a table, a
cross-tab, two figures compared), **Bar**, **Line and area**, **Pie**, **Scatter**, **Distribution**, **Hierarchy**
(treemap, sunburst, tree), **Flow** (Sankey, chord), **Grid** (heatmap, calendar), **Other** (funnel, gauge, radar and
more) and **Summaries**. Each says what it needs, for example *Two text columns and a number* for a heatmap.

## Add a filter bar
A filter bar lets every reader narrow the board without editing it.

1. Choose ⋯ › **Add a filter bar** (or **Edit filters** on the bar).
2. Choose **Add a date range** for the one date filter, or **Add a filter** for a list of values.
3. For each, give a **Label** (for example *Ward*), pick the **Dataset** and **Column** its values come from, and, if
   other files call the column something else, list those names under **Also lands on columns named…**.
4. A date range can open on a default (**Opens on**).
5. Choose **Save filters**.

A filter narrows every widget whose data has its column; the others say so. See
[Narrow it with the date range and filters](#dash-boards--narrow-it-with-the-date-range-and-filters).

## The board's chart theme
The theme button beside ⋯ (it reads **Console** until you pick another) sets the theme every widget draws in. A widget can still choose its own in its
**Chart settings**. Choosing a theme runs nothing.

## Delete a board
Choose ⋯ › **Delete this dashboard** and confirm. The saved analyses and queries its widgets used are kept.

## Limits
| What | Limit |
|---|---|
| Widget height | 120 to 600 pixels, or empty for automatic |
| Filters on one board | 12, of which one date range |
| Chart kinds | 52 |

## Example
Ana García, the retail analyst at Summit Valley Health System, saves *Sales by store* in Analytics Studio, adds it to
**Retail stores** as a **Ranked bars** widget at 6/12, and starts a section *This month* above it. She adds a filter
bar with a **Store** filter, so the pharmacy managers can each look at their own store.
