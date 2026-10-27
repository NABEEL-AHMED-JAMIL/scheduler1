---
id: tour-care-plan
title: The care plan
summary: The AI drafts the plan, a colleague approves it while Dr. Patel is away, a senior doctor approves because the risk is High, and the pharmacist checks the medicines.
section: Care
who: The approvers each step names: a person, a team, or a role
where: Run & review › Review › Approvals (/review/approvals); Run & review › My requests (/review/requests)
related: tour-diagnostics, tour-ward
---
With registration, triage, labs and imaging in, the workflow asks for a care plan. This is where the approval workflow
earns its keep: who decides depends on what the plan says, and on who is in. (Fictional patient and clinicians,
synthetic data.)

## What happened
1. **Care-plan draft (AI)**: the workflow runs **Journey 9 · Care-plan draft** for Elena. It gathers the outputs of the
   earlier pipelines and asks the workspace's model for a care plan, labelled DRAFT. The answer includes a risk level,
   and it came back **High**. The run's **AI answers** tab shows the call: the prompt "Care plan (DRAFT)", how long it
   took and how many tokens it used.
2. **Attending physician approves the care plan**: the task waits for Dr. Anika Patel. She is away, and Dr. Minh Nguyen
   stands in for her, so the task shows in his list as **Standing in for Dr. Anika Patel**. He approves; the history
   reads "approved by Dr. Minh Nguyen (for Dr. Anika Patel)".
3. **High risk in the care plan?**: a condition reads the plan's risk. Because it is High, the workflow takes the
   "yes" branch.
4. **Senior physician approves**: the team Senior physicians is asked; Dr. Chidi Okafor approves. With a Low risk this
   step would not have been asked at all.
5. **Medication safety check**: the workflow runs **Journey 10**, which lists Elena's medicines, looks up their
   ingredients, joins them to a synthetic interaction reference (for demonstration only, not clinical advice) and to her
   allergies, and holds the 25 flagged pairs at an Approval step. Avi Cohen, the pharmacist, approves them.
6. **Tell the ward**: the Ward 4B nursing team is notified.

![The request's history](tour-care-plan "Review › Approvals › My requests: the Patient journey request, the care plan's risk, and who approved for whom")

## Where to see it
- **Review › Approvals**: the approver's tasks, with **Approve**, **Reject**, **Ask for changes** and **Pass on**.
  Rejecting may need a comment saying why; the step says so.
- The request in **My requests**: its details, including the care plan's risk, and its **History**.

> **Note:** No one may approve their own request: someone else always decides it.

## Learn more
See [Design an approval workflow](#apr-workflows), [Who decides](#apr-who-decides), [Out of office](#adm-out-of-office)
and [AI in pipelines](#ai-steps). Next: [every day on the ward](#tour-ward).
