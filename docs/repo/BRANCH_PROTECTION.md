# Branch Protection Guidelines

These steps help keep `main` stable and require the right signals before
merging.

## Required status checks

1. Go to Repository Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable “Require status checks to pass before merging”
4. Select required checks:
   - `required-checks-gate` (Required Checks Gate)
   - Optionally: `CodeQL` (codeql-analysis)
5. Check “Require branches to be up to date before merging”

## Pull request reviews

- Require at least 1 approving review
- Dismiss stale approvals when new commits are pushed (recommended)
- Require review from Code Owners (optional, if CODEOWNERS is present)

## Additional protections (optional)

- Restrict who can push to matching branches (use for admins/bots)
- Require signed commits (if your workflow uses GPG/Sigstore)
- Require linear history (if you want to disallow merge commits)

## Coverage enforcement (later)

Once coverage mapping is reliable, enable CI threshold enforcement:

- Uncomment the “Enforce coverage thresholds” step in `.github/workflows/ci.yml`
- Or add a separate required job that runs `pnpm run coverage:check`

## Environments (optional)

Create `staging` and `production` environments under Settings → Environments and
then gate jobs that deploy or test against those environments.

- Add required reviewers for environment deployments
- Add environment secrets and use them in workflows

## Solo developer setup (no other reviewers)

If you're the only committer, you still get strong protections without blocking
yourself:

- Recommended: Status checks only

  - In Branch protection: Do NOT enable “Require pull request reviews”.
  - Enable “Require status checks to pass before merging” and choose at least:
    - `required-checks-gate` (our CI gate)
    - Optionally `codeql-analysis` for security
  - Enable “Require branches to be up to date before merging”.
  - Result: PRs must be green on CI, but no review is required.

- Keep PR flow but allow bypass (advanced)

  - Option A (simple): In the rule, uncheck “Include administrators”. As a repo
    admin, you can merge without a review if necessary. Note: this also lets you
    bypass failed checks—use with care.
  - Option B (granular, where available): Use Repository Rulesets (Settings →
    Rules → Rulesets) to require status checks, and add yourself under “Bypass
    pull request requirements” so you can merge without a reviewer, while others
    (future collaborators) cannot.

- Avoid: Bot auto-approval
  - While possible to wire up a bot/user to auto-approve, this is brittle and
    not recommended for security/compliance. Prefer status-check-only
    protection.

Tip: Even solo, open PRs from feature branches and let CI run. This maintains
history and keeps a clean main.
