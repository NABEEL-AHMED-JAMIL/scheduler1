---
title: Manual test guide
chapter: 22
part: Part IX · Build it yourself
icon: checkCircle
blurb: Numbered checks with steps, expected results and a pass/fail box, feature area by feature area.
paths:
sections: How to test | Set up and access | Data in and build | Run and review | Results | Administer | Across the product
---
A checklist for testing the ETL Console by hand, one article per feature area, in the order of this book. Each check has
a number that never changes, exact steps with the screen names, the result you should see, and a box to tick. Roles and
isolation are tested in every area: what a reviewer, a viewer and a front-desk person may open, and that a second
workspace can see and open nothing of yours.

## Start here
1. [Prepare the test accounts](#qa-guide) — An administrator, a second administrator, a reviewer, a viewer, a front desk, a researcher and someone in a second workspace. ![](qa-sign-in)
2. [Check who may open what](#qa-people) — Profiles, one person's tabs, delegates and teams. ![](qa-not-your-access)
3. [Build and run a known pipeline](#qa-pipelines) — Three wards in, two out, every number known. ![](qa-runs-failed)
4. [Decide what waits for a person](#qa-approvals) — Run reviews, Approval steps, workflows and bulk decisions. ![](qa-review-all)
5. [Test masking](#qa-dashboards) — A researcher sees sensitive columns masked until access is granted. ![](qa-catalog-masked)
6. [Test that workspaces are kept apart](#qa-security) — Every link of yours opens nothing in another workspace. ![](qa-isolation-run)

## Questions
### Which accounts do I need?
Seven test accounts, each with a letter used in the steps: A, A2, R, V, F, RS and X. See
[The test accounts](#qa-guide--the-test-accounts).

### What do I do when a check fails?
Keep the screen, take a screenshot, note the run's number and the exact message, then write what you expected and what
you saw. See [When a check fails](#qa-guide--when-a-check-fails).

### What does "(not yet verified)" mean?
The behaviour is built or planned but has not been seen working end to end. Test it like any other check: your result
is how it becomes verified. See [How a check reads](#qa-guide--how-a-check-reads).

### May I use real patient data to make a test realistic?
No. Every file, answer and number must be made up. See [Synthetic data only](#qa-guide--synthetic-data-only).

### How do I test that the AI never writes to a database or invents a file?
Ask the AI Assistant to do exactly that: it must refuse the write and name the missing file. See
[the AI Assistant checks](#qa-ai--the-ai-assistant).

### How do I test that another workspace cannot see our data?
Copy the addresses of a run, a form, a document and a dashboard, and open them signed in to the second workspace. See
[Workspaces are kept apart](#qa-security--workspaces-are-kept-apart).

### Can a check's number change?
No. Once printed, a number stays; new checks are added at the end of their area.

## Related
- getting-started
- administration
- security
- troubleshooting
- recipes
