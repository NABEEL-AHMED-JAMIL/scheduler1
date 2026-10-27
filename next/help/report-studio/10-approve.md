---
id: rs-approve
title: Approve, sign and verify
summary: Ask for approval, approve and sign in Review › Approvals or on the report, the approver's own signature on the page, two approvals, who approves, and Verify signature.
section: Approve and sign
who: Approve and sign reports, and not the person who generated the version
where: Run & review › Review › Approvals (/review/approvals); Reports › Library (/reports/library); Reports › Settings (/reports/settings)
related: rs-branding, rs-versions, apr-review-home
popular: Approve and sign a report
---
An approval is a person's decision about what they have read. When it is made, the PDF is signed digitally in the
approver's name with the time, using the workspace's certificate: anyone can later check who approved which file and
that it has not changed since.

## Ask for approval
- On a report's page, choose **Ask for approval** on the current version, or tick **Ask for approval when it is ready**
  when you generate.
- Or let the workspace ask for every version: **Reports › Settings › Ask for approval of every new version**.

The version then waits in the approvers' **Review › Approvals**. A newer version replaces the request.

## Approve and sign
1. Open **Review › Approvals** (or the report's page). The task shows the first page and the next ones.
2. Read it. Choose **Approve and sign**, or **Reject**, which needs a reason the person who asked reads.
3. The version now reads **Signed**, with your name and time under **Approved and signed**.

![A signed report](rs-report-page "A report's page: the current version, approved and signed, its PDF and HTML, and where it came from")

> **Note:** Whoever generated a version never approves it (the page says "You generated it; someone else approves it").
> Only a report's **current** version can be approved; an older one never approved reads **Superseded**.

## The approver's own signature
A template with an **Approver's signature** shows on each version whose approval it is, in that person's own hand:

- Until it is approved, the version shows an empty box, **Awaiting approval**. Before you approve, the task in **Review ›
  Approvals** says under **On the page** whether it will show your own signature or your typed name.
- At **Approve and sign**, the box is filled with the approver's own latest approved signature (a signature in **Assets
  & branding** that **Belongs to** them), their name, the **Title** on that signature, and the time, on a 24-hour clock
  in the workspace's time zone. The PDF is then signed, so the signature on the page is covered by the digital one.
- Someone with no approved signature of their own gets their typed name and **Signed digitally** instead. Never
  another person's picture.
- With **Two approvals**, an Approver's signature set to **The second approver** is filled with the second person, at
  the second approval; with one approval it says **No second approval**.
- The report's page lists under **Signature on it** whose signature was placed and whether it was their own signature
  or their typed name. The HTML download shows it too.
- An approved version stays exactly as it was approved: a signature replaced or retired later never changes it. The
  next approval places the signature in use then.

> **Note:** A stamp beside it stays the workspace's stamp, chosen in the template.

## Two approvals
With **Two approvals** on (Reports › Settings), a second person approves after the first: the first chooses **Give the
first approval of vN**, and the PDF is signed when the second approves, naming both.

## Who approves
In **Reports › Settings**, a workspace administrator sets **Who approves**: **Automatic: the team whose people may
approve**, **The workspace administrators**, or a team you name. **Who publishes** works the same for templates, and
**Publishing needs a second person** stops anyone publishing a draft they edited last or asked to have published. All of
these are off at first.

![Report settings](rs-settings "Reports › Settings: who approves and publishes, retention preview and the page limit")

## Verify a signed PDF
1. On the report's page choose **Verify signature** (or **check signature** beside the approval).
2. **Check version N** checks the stored PDF; **Check a file someone sent** checks a copy you were sent.
3. **The signature holds** when the file is that version as approved, unchanged since; otherwise **Not verified** and
   why. The panel lists who signed, when, the certificate, whether anything changed or was added after signing, and
   whether a stored approved version of this workspace has this file.

![Verify signature](rs-verify "Verify signature: the signature holds, signed by Dr. Minh Nguyen, nothing changed since")

> **Note:** Adobe Reader shows the signature as intact with "validity unknown" until a trusted certificate replaces the
> platform's test certificate. **Verify signature** does not need that trust.

> **Warning:** The signature proves who approved which file and that it has not changed since, not that its content is
> right. Read before you approve.

## Good to know
- A brand profile with **Digitally sign PDFs when approved** off approves without signing; the page says why it is not
  signed.
- Signatures and stamps waiting for approval wait in **Review › Approvals** too.
- Downloads are signed links that work for five minutes, for the person who asked.
