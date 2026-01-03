# Branch Protection Configuration Guide

This document describes the required branch protection settings for the Political Sphere CI/CD platform repository.

---

## Overview

Branch protection rules enforce security and code quality gates before code can be merged. All main branches must enforce these rules to prevent unauthorized or unvetted changes from reaching production.

---

## Required Branch Protection Rules

### Protected Branches

- `main` (primary production branch)
- `develop` (if applicable)
- Release branches (`release/*`)

---

## Protection Rule Configuration

### 1. Require Status Checks to Pass

**Setting**: Require status checks to pass before merging

**Required Status Checks**:
```yaml
checks:
  - "validate-ci"           # CI policy validation (SHA pinning, permissions, etc.)
  - "pr-gates"              # Fast PR validation (lint, type, test, duplication, secrets)
  - "security-scheduled"    # Scheduled security scans (CodeQL, Semgrep, SAST)
  - "license-compliance"    # Dependency license policy
  - "consumer-contract"     # Consumer repo contract validation (if applicable)
```

**Configuration Steps**:
1. Repository Settings → Branches
2. Click "Add rule" under "Branch protection rules"
3. Branch name: `main`
4. Enable "Require status checks to pass before merging"
5. Make required checks "required" (not optional):
   - Select each check from the dropdown
   - Click "Require" for each

**Rationale**: Ensures all automated gates pass before merge; prevents bypassing security validation.

---

### 2. Require Code Reviews

**Setting**: Require pull request reviews before merging

**Configuration**:
```yaml
require_code_review:
  number_of_approvals: 1  # Minimum reviewers required
  dismiss_stale_reviews: true  # Stale reviews don't count after updates
  require_review_from_code_owners: true  # Enforce CODEOWNERS
  restrict_dismissals: true  # Only admins can dismiss reviews
```

**Configuration Steps**:
1. Repository Settings → Branches → Branch rule (main)
2. Enable "Require a pull request before merging"
3. Set "Require approvals": 1 minimum
4. Enable "Dismiss stale pull request approvals when new commits are pushed"
5. Enable "Require review from Code Owners"
6. Enable "Restrict who can dismiss pull request reviews" → Select "repo:PoliticalSphere/ci-team" or equivalent

**Rationale**: Ensures human review before merge; prevents single-point-of-failure approvals.

---

### 3. Require Branches to Be Up to Date

**Setting**: Require branches to be up to date before merging

**Configuration**:
1. Repository Settings → Branches → Branch rule (main)
2. Enable "Require branches to be up to date before merging"

**Rationale**: Prevents stale PRs from merging; ensures branch is tested against latest main.

---

### 4. Require Conversation Resolution

**Setting**: Require all conversations on the pull request to be resolved before merging

**Configuration**:
1. Repository Settings → Branches → Branch rule (main)
2. Enable "Require conversations to be resolved before merging"

**Rationale**: Ensures review comments are addressed; prevents dismissing feedback.

---

### 5. Require Signed Commits

**Setting**: Require all commits to be signed (optional but recommended)

**Configuration**:
1. Repository Settings → Branches → Branch rule (main)
2. Enable "Require signed commits"

**Rationale**: Provides commit authenticity verification; prevents spoofed commits.

**Note**: Requires all contributors to set up GPG/SSH key signing.

---

### 6. Require Up-to-Date Reviews

**Setting**: Automatically update pull request branches (optional)

**Configuration**:
1. Repository Settings → Branches → Branch rule (main)
2. Enable "Automatically update pull request branches"

**Rationale**: Auto-updates PRs after review; reduces manual rebasing.

---

### 7. Administrator Overrides

**Setting**: Allow administrators to bypass protection rules

**Configuration**:
1. Repository Settings → Branches → Branch rule (main)
2. **Disable** "Allow force pushes" (no exceptions)
3. **Disable** "Allow deletions" (no exceptions)
4. Keep "Allow administrators to bypass required pull request reviews" **disabled**

**Rationale**: Enforces consistent security gates even for admins; prevents emergency bypasses that could weaken controls.

---

## CODEOWNERS Configuration

### Purpose

Define who must review certain files/areas.

### Setup

Create `.github/CODEOWNERS` file:

```bash
# Default owners for all files
* @platform-governance

# Security policy files
/configs/ci/policies/** @security-team
/docs/security-ci-policy.md @security-team
/docs/risk-decisions.md @security-team

# Workflow files
/.github/workflows/** @platform-governance

# Tests
/tools/tests/** @platform-team
```

---

## Workflow for Merging

### Standard Flow (Enforced by Rules)

1. **Create branch** from `main`
2. **Make changes** and push
3. **Open PR** (triggers PR security and PR gates)
4. **Wait for status checks** to pass (all workflows succeed)
5. **Request review** from code owners
6. **Address review feedback** (dismisses stale reviews auto)
7. **Maintainer approves**
8. **Merge** (button enabled only after all rules pass)

### Emergency Override (Rare)

If a critical security patch is needed and normal gates are failing:

1. **Document justification** in a risk decision (RD-YYYY-###)
2. **Notify security team** before proceeding
3. **Create temporary exception** in branch protection rule
4. **Merge with override**
5. **Restore rule immediately after** merge
6. **Post-incident review** of why gates failed

---

## Monitoring & Auditing

### 1. Review Dismissals

Regularly audit who dismissed reviews:

```bash
# Via GitHub API
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/PoliticalSphere/ci/pulls" \
  | jq '.[] | select(.review_comments_url != null) | {number, title, user}'
```

### 2. Force Pushes

Monitor for forced pushes to protected branches (should be impossible if rules are enforced):

```bash
# Organization Audit Log → Filter: action = "push" AND force = true
```

### 3. Rule Changes

Alert on any modification to branch protection rules:

```bash
# Organization Audit Log → Filter: action = "branch_protection_rule.*"
```

---

## Testing Branch Rules

### 1. Verify Status Check Enforcement

```bash
# Create test branch
git checkout -b test/branch-protection-test

# Make a small change without running gates
echo "test" >> README.md
git add README.md
git commit -m "test: trigger PR gates"
git push -u origin test/branch-protection-test

# Create PR
# Observe: "Merge" button should be disabled until checks pass
# Expected: Red X icons for failing checks
```

### 2. Verify Code Review Enforcement

```bash
# After PR is created:
# 1. Check: Merge button is disabled without approval
# 2. Approve PR from code owner account
# 3. Merge button should become enabled (if all checks pass)
```

### 3. Verify Up-to-Date Requirement

```bash
# 1. Create two PRs (A and B) from main
# 2. Merge PR A
# 3. PR B's merge button should show: "This branch has conflicts with the base branch"
# 4. Click "Update branch" to sync
# 5. Verify tests re-run after sync
```

---

## Rollout Timeline

| Step | Target | Status | Owner |
|------|--------|--------|-------|
| 1 | Enable status checks (validate-ci, pr-gates) | Complete | platform-governance |
| 2 | Enable code review requirement (1 approver) | Complete | platform-governance |
| 3 | Enable branch up-to-date check | Complete | platform-governance |
| 4 | Configure CODEOWNERS | Pending | security-team, platform-team |
| 5 | Enable require signed commits | Pending | platform-governance |
| 6 | Lock down admin overrides | Pending | org-owners |
| 7 | Document exceptions in risk-decisions.md | Ongoing | all teams |

---

## Exceptions & Risk Decisions

Any deviation from these rules must be documented:

```yaml
- id: RD-2026-XXX
  scope: branch_protection
  decision: "Temporarily disable status check for emergency security patch"
  rationale: "Critical vulnerability requires immediate merge"
  expires: YYYY-MM-DD  # Maximum 7 days
  approval: security-team
```

---

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Code Owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [GitHub Status Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-status-checks)
- [GitHub Organization Audit Log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)
