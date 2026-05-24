# Branch workflow

This repo uses a two-branch promotion model: **`dev`** is the integration
branch; **`main`** is production.

## Day-to-day development

1. Branch from **`dev`**:
   `git checkout dev && git pull && git checkout -b fix/my-change`
2. Open a PR into **`dev`** and wait for CI (`Required Checks Gate`).
3. Squash-merge into **`dev`**.

## Promote to production

1. Create a promotion branch from **`dev`**: `promote-dev-to-main-YYYYMMDD`
2. Open a PR into **`main`**. The **Main Promotion Policy** workflow only allows
   sources named `dev` or `promote-dev-to-main-*`.
3. Squash-merge into **`main`**.

## Keep dev aligned with main

After each promote, open a content-only PR from **`main`** into **`dev`**
(squash). Do not merge **`main`** into **`dev`** with a merge commit — **`dev`**
requires linear history.

## Dependabot

- All Dependabot PRs target **`dev`** (see `.github/dependabot.yml`).
- Never merge dependency PRs directly into **`main`**; promote through
  **`dev`**.
- If Dependabot opens against **`main`**, retarget to **`dev`** or recreate the
  bump on a feature branch from **`dev`**.

## Branch hygiene

- Delete remote feature branches after merge.
- Long-lived branches: **`main`**, **`dev`**, and active PR heads only.
- Do not push directly to **`main`** or **`dev`** except via PR.
