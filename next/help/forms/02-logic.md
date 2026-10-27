---
id: form-logic
title: Show or require a field when
summary: Show a field, or make it required, only when an earlier answer says so.
section: Build and share
who: Workspace administrators
where: Forms › Forms (/forms/builder)
related: form-build, form-submissions
---
Not every question applies to everyone. With logic, a field appears only when an earlier answer calls for it (the
allergy list only when the answer to "Any allergies?" is yes), or becomes required only then (a member ID unless the
patient is self-pay). A field that is not shown is not asked, and its answer is not kept.

## Add a rule
1. Open the form in the builder and choose the **Logic** tab. Each field after the first is listed with two settings.
2. Under **Show only when**, pick the earlier field it depends on; **Always shown** means no rule.
3. Pick how to compare it, then the value:

| Comparison | True when the answer… |
|---|---|
| **is** | equals the value |
| **is not** | is anything else |
| **is one of** | is one of several values, written `a, b, c` |
| **is more than** | is a larger number |
| **is less than** | is a smaller number |
| **is answered** | was given |
| **is not answered** | was left empty |

4. Under **Also required when**, do the same to make the field required only in that case; **No extra rule** means
   none.
5. Choose **Save**.

For a **Yes / no** field, the value is a choice of **Yes** or **No**. A **Table**, **File upload** or **Signature**
field can only be tested for **is answered** or **is not answered**.

You can also start from a field on **Build**: select it and choose **Add logic (show or require it when…)**. The tab's
title counts the rules, such as **Logic (2)**, and on **Build** each field with a rule says so under it.

![The Logic tab](form-logic "Logic: for each field, when it is shown and when it is also required")

![A field required only when another answer says so](form-logic-rule "On the form: Member ID, required when Payer is not Self-pay")

> **Note:** A rule can only depend on a field above the one it applies to, so the form reads top to bottom. A form
> with a single field has nothing to depend on yet: add a second field first.

> **Tip:** Check the rules with **Preview**: answer the earlier field and watch the later ones appear or become
> required.

## Example
On Summit Valley's **Admission intake**, **Member ID** is required when **Payer** is not **Self-pay**, and the
allergy list is shown only when **Any allergies?** is **Yes**. A walk-in who pays for themselves is never asked for a
member ID, and a nurse never scrolls past an empty allergy list.
