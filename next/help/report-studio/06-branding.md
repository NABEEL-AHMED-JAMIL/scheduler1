---
id: rs-branding
title: Branding and assets
summary: Logos, images and letterheads; signatures and stamps with their custodian, approval and grants; brand profiles.
section: Design
who: Report assets and branding for logos, images and brand profiles; Upload signatures and stamps for those; approving needs Approve and sign reports
where: Reports › Assets & branding (/reports/assets)
related: rs-designer, rs-approve, rs-components
popular: Upload a signature and get it approved
---
**Assets & branding** holds the pictures reports use and the brand profiles that make every report look the same. It
has three tabs: **Assets**, **Brand profiles** and **Signatures and stamps**.

![Assets & branding](rs-assets "Reports › Assets & branding: approved logos, a letterhead, a signature and a stamp, and the workspace's default brand profile")

## Upload a logo, image or letterhead
1. Open **Reports › Assets & branding** and choose **Upload asset**.
2. Choose the **Kind**, give it a **Name** (and optionally a title, description and category) and pick the **File**: SVG,
   PNG or JPG, up to 10 MB. Each picture is checked by its content and re-encoded; an SVG is drawn into a PNG first.
3. A logo or image can be used at once; a new upload of it is a new version, and old reports keep the version they used.

## Signatures and stamps
A signature has two parts. The **picture** is only how it looks on the page. The **digital signature** is added to the
PDF when its owner approves a report: it records who approved and when, and any later change to the file breaks it.

1. A person with **Upload signatures and stamps** (the custodian) uploads it, choosing the **Kind** Signature or Stamp.
   A signature names who it **Belongs to**.
2. It **waits for an approver**, who is never the person who uploaded it. The approver decides it on the asset's page
   (**Approve vN** or **Reject vN**) or in **Review › Approvals**.
3. Only the person a signature belongs to, or someone they grant it to (**Grant use to…** on the asset's page), may place
   it on a template. A stamp needs a grant too.
4. On the asset's page, **Placement on a template** adds it to a template's draft: choose the template, the position
   (**Last page · end** or **Before the footer · movable**), the width and alignment, and an optional stamp beside it,
   then **Add to the template's draft**.

![A signature's page](rs-asset-signature "A signature's page: its approved version, where it is used, who may place it, and its digital signature")

> **Warning:** A signature picture is not a signature. Only an approval signs the PDF. Never let the picture stand for
> an approval that did not happen.

## Replace and retire
- **Upload new version** replaces a picture. For a signature or stamp the new version needs approval; the current one
  stays in use until then.
- **Retire** stops new use; old reports and their history stay. The asset's page shows where it is used first.
- **Delete** is offered only for an asset nothing ever used.

## Brand profiles
A brand profile is the optional defaults every report can share: **Logo**, **Heading font** and **Body font**, the
colours, **Organisation name**, **Contact email**, **Website**, **Phone**, the **Header**, **Footer** and
**Confidentiality line** (they may name `{{report.period}}`, `{{contact.email}}` and `{{website}}`), the approved
signatures and stamps templates may choose from, and **Digitally sign PDFs when approved**.

1. Choose **New brand profile**, fill in what you want (every field is optional; an empty one inherits), watch the **Live
   preview**, and **Save draft**.
2. **Publish vN** (publishing a profile needs an approver), then **Make the workspace default**.
3. New versions apply to future reports only.

**Which setting wins**, highest first: an allowed override on a single report, the template's setting, the brand
profile, the workspace default, the platform default. The confidentiality line, signatures and stamps are fixed to
approved settings.

> **Tip:** The colours are checked for contrast: the page says when text and background pass WCAG AA.

## Example
Summit Valley's custodian (the workspace administrator) uploaded **Dr. Anika Patel signature** and the **Summit Valley
Medical Center · Clinical records** stamp; Jordan Reyes, the second administrator, approved them. The **Summit Valley
standard** profile is the workspace default, with the logo, the letterhead, the teal main colour and "Confidential:
synthetic demonstration data · {{report.period}}" as the confidentiality line.
