# Branch Controls — Superadmin Guide

This guide is for the business owner. It explains how to control branches and
features for every lab on the platform. No technical knowledge needed.

## 1. Where to find Branch Controls

1. Log in to the **superadmin** account (the platform owner login, not a lab login).
2. In the left-side menu, click **Branch Controls**.
3. You will see a table with one row per lab, showing:
   - **Lab** — name of the lab
   - **Plan** — the subscription plan the lab is on
   - **Status** — whether the lab is active
   - **Branches** — how many branches the lab currently has
   - **Features** — how many features are enabled for the lab
   - **Actions** — click to open that lab's branch and feature settings

## 2. Setting a branch limit for a lab

The branch limit is the maximum number of branches a lab is allowed to create.

1. In **Branch Controls**, click the lab you want to change.
2. Find the **Branch limit** box. It shows a number.
3. Type a new number and click **Save**.

**What happens when a lab hits the limit?** When a lab admin tries to add a
new branch beyond the limit, the system blocks it and shows this message:

> Branch limit reached (N of M branches). Ask your superadmin to raise the limit.

There is no way around it — the block happens on the server, so the lab cannot
create the branch from any device or browser.

Notes:
- Existing branches are never touched when you lower a limit. Only *new*
  branch creation is blocked.
- Setting the limit to **0** means the lab cannot add any branches at all.
  Existing branches keep working.

## 3. Enabling / disabling features per lab

Every lab has a set of features (patients, invoices, WhatsApp, SMS, email,
reports, and so on). All features are enabled by default. You can switch any
of them off for a specific lab.

1. In **Branch Controls**, click the lab you want to change.
2. Find the **Features** section — a grid of checkboxes, one per feature.
3. Tick a box to enable the feature; untick it to disable it.
4. Click **Save**.

**What does "disabled" look like to the lab?**
- The menu item disappears from the lab's left-side menu.
- If the lab admin tries to open the feature's page directly, they see:

> This feature is not enabled for your lab

Two features — **Dashboard** and **Settings** — can never be switched off.
They are required for the lab to work, so their checkboxes are locked.

## 4. Viewing a lab's branches

1. In **Branch Controls**, click the lab.
2. The lab's branch list shows every branch: name, branch code, address, phone,
   manager, and whether it is active.

The lab admin can also see and manage their own branches inside their app
under **Settings → Branches**.

## 5. Recommended defaults

- **Branch limit:** keep **5** for most labs. Raise it for chains and hospital
  groups (Enterprise plan).
- **Features:** keep **everything enabled** unless a plan or deal says
  otherwise. If you sell tiers, the typical things to switch off for lower
  tiers are **WhatsApp**, **SMS**, and **Online Payments** — the paid add-on
  features. Core lab work (patients, results, invoices, reports) should stay
  on for everyone.

## 6. FAQ

**I disabled WhatsApp but the lab still sees it.**
The lab's app loads its feature list when the user logs in. Ask the lab admin
to **log out and log back in** (or just refresh the page) — the change will
then take effect.

**Can a lab create more branches than the limit?**
No. The limit is enforced on the server, so it applies no matter which
browser or device the lab uses.

**Does deactivating a branch free up a slot?**
Yes. Only *active* branches count toward the limit. If a lab is at its limit
and deactivates one branch, it can add a new one right away.
