---
title: Security and privacy
chapter: 17
part: Part VII · Administer
icon: shield
blurb: Sign-in security, keeping data apart, the managed service, data policies, retention and audit.
paths: /administration/security, /administration/data-policies
sections: Sign-in | Your data | Records and audit
---
How the console protects your workspace and its data: the sign-in rules, how workspaces are kept apart and when our team may see yours, which models may see which data, masked columns, how long data is kept, and where every action is recorded.

## Start here
1. [Set the workspace's sign-in rules](#sec-sign-in) — Passwords, lockout, idle sign-out and two-factor. ![](sec-sign-in-rules)
2. [Choose which models may see sensitive data](#sec-data-policies) — One rule per data level. ![](sec-data-policies)
3. [Know what our team can see](#sec-managed) — Managed sessions, and every action they take listed for you. ![](sec-team-activity)
4. [Set how long data is kept](#sec-retention) — Days per kind of data, previewed first. ![](sec-retention)
5. [Read who did what](#sec-audit) — Sign-ins, access changes and approvals. ![](sec-history)

## Questions
### How do I hide patient identifiers from researchers?
Mark the columns sensitive in the Data Catalog; they are masked for anyone without access. See [Masked columns](#sec-data-policies--masked-columns).

### Can your staff see our data?
Only inside a recorded managed session, and everything they change or open is listed for your administrators. See [What our team can see, and when](#sec-data-yours--what-our-team-can-see-and-when).

### Can the console write to our database?
No. Database connections are read-only. See [What the console never does](#sec-data-yours--what-the-console-never-does).

### Does sensitive data go to a hosted AI model?
Not by default: Sensitive data starts as **Local only**. See [Choose which models may see sensitive data](#sec-data-policies--choose-which-models-may-see-sensitive-data).

### How do I require two-factor sign-in only for clinicians?
Turn it on on their access profile. See [Two-factor sign-in for everyone, or for some](#sec-sign-in--two-factor-sign-in-for-everyone-or-for-some).

### Is anything deleted automatically?
Not until you set retention: it starts off, and keeps everything. See [Retention](#sec-retention).

### What changes if our workspace is managed by your team?
The build screens become read-only for your people; you still run, review and manage access. See [The managed service](#sec-managed).

### Does the console make us compliant?
No product does that by itself; it gives you the controls. See [Working with health data](#sec-health-data).

## Related
- administration
- ai
- getting-started
- billing
