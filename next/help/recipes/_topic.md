---
title: Recipes: build it yourself
chapter: 21
part: Part IX · Build it yourself
icon: layers
blurb: Step-by-step guides that build each worked example from an empty workspace, with sample files to download.
paths:
sections: The patient journey | Healthcare | Other industries | Building blocks
---
Each recipe builds one working example in your own workspace, from nothing: what you will build, what you need first,
every step with the exact screen names and the values to type, how to check it worked, and the mistakes people make.
The sample files are synthetic and download from each recipe. Follow the patient journey in order, or pick any recipe on
its own.

## Start here
1. [Set up and take in a referral](#rcp-journey-referral) — Storage, a model, Email-in and the first document review. ![](rcp-j-referral-run)
2. [Ask a model about each row](#rcp-ai-prompt) — An AI prompt step that classifies or summarises rows. ![](rcp-ai-denials-steps)
3. [Find duplicate patient records](#rcp-mpi-duplicates) — A first pipeline: read a file, match, remove duplicates. ![](rcp-x-mpi-run)
4. [A branded one-page report](#rcp-branded-report) — A brand, a template with a table and a chart, a report. ![](rcp-b-designer-chart)
5. [A nightly schedule for new files](#rcp-nightly-new-files) — Run every night on only the files that arrived. ![](rcp-b-nightly-schedule)
6. [An approval workflow with a condition](#rcp-approval-condition) — Teams, a high-risk rule, a deadline and a stand-in. ![](rcp-b-condition)

## Questions
### Do I need the Summit Valley workspace to follow these?
No. Every recipe starts from an empty workspace and gives you the sample files. Summit Valley Health System is the
fictional example the screenshots come from.

### Are the sample files real patient data?
No. Every file is synthetic and made up for this guide, and the people in them are fictional. Use synthetic or
de-identified data while you learn.

### A recipe says "Not yet verified end to end". What does that mean?
The steps were written from the product and checked piece by piece, but the whole recipe has not been run from start
to finish yet. Follow it, and if a step differs from your screen, the screen wins.

### Which recipe should I start with?
If you are new, [Find duplicate patient records](#rcp-mpi-duplicates) is the shortest complete pipeline. For reports,
start with [A branded one-page report](#rcp-branded-report).

### The counts in "Check it worked" don't match mine.
Check you used the sample file unchanged and the same settings; a filter or a date left at its default changes the
counts. The [Troubleshooting](#ts-runs) topic explains the messages.

## Related
- pipelines
- steps
- report-studio
- test-guide
