# Downstream Consumer Integration Guide

**Phase 1.1: Downstream Integration**

This guide enables sister repositories to consume the Political Sphere CI platform via `workflow_call`, eliminating configuration duplication while maintaining strict versioning and security.

---

## Quick Start (5 minutes)

### For Test Consumer Repo

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: Run Political Sphere CI
    uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
    permissions:
      contents: read
      pull-requests: read
    secrets: inherit
```

**That's it.** Your test consumer repo will now:

- Run all 12 linters (gitleaks, biome, eslint, typescript, knip, jscpd, etc.)
- Validate action pinning
- Enforce policy gates (once policy engine is active)
- Share logs with the parent CI platform

---

## Versioning Contract

### Pinning Strategy

**Current (Testing)**: Pin to `main` branch

```yaml
uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
```

**Production (After v1.0.0 Release)**: Pin to major version tag

```yaml
uses: PoliticalSphere/ci/.github/workflows/ci.yml@v1
```

**Exact SHA (Maximum Security)**: Pin to commit SHA

```yaml
uses: PoliticalSphere/ci/.github/workflows/ci.yml@cc5de1896a6c01e63944aa88c7798f1a9eb84c5a
```

### Versioning Rules

| Scenario | Pin Strategy | Update Cadence |
| --- | --- | --- |
| Testing/Development repos | `@main` | Real-time (every push) |
| Production repos | `@v1` or `@v1.2` | Monthly/Quarterly review |
| High-security repos | `@<SHA>` | Quarterly security audit |

### Breaking Changes

Breaking changes (new required attestations, policy rule changes) will only occur on major version bumps (v1 → v2). Minor updates (v1.0 → v1.1) are always backward-compatible.

---

## Reusability: How `workflow_call` Works

The CI platform workflow is published as a **reusable workflow**. When you use:

```yaml
uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
```

GitHub will:

1. Check out the CI platform repository at the specified ref
2. Execute `.github/workflows/ci.yml` **in the context of your consumer repo**
3. Run all jobs with your consumer repo's code
4. Report results back to your PR

### Key Properties

✅ **Centralized logic**: All linter configs live in PoliticalSphere/ci  
✅ **No duplication**: Consumer repos don't copy linter configs  
✅ **Independent execution**: Each consumer repo gets its own CI job  
✅ **Audit trail**: All runs traceable to CI platform version  
✅ **Pinned dependencies**: Actions remain pinned to SHAs  

---

## Permissions Model (Least Privilege)

The reusable workflow declares all required permissions explicitly:

```yaml
on:
  workflow_call:
    inputs:
      skip-policy:
        description: 'Skip policy evaluation (for testing only)'
        type: boolean
        default: false

permissions:
  contents: read
  pull-requests: read  # Policy engine needs to read PR body for attestations
```

### Consumer Repo Permissions

Your consumer workflow must pass through the minimum required permissions:

```yaml
jobs:
  ci:
    uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
    permissions:
      contents: read
      pull-requests: read
```

### What Each Permission Does

| Permission | Used For | Why |
| --- | --- | --- |
| `contents: read` | Checkout code, read workflow files | Linters need source code |
| `pull-requests: read` | Parse PR body for attestations | Policy engine validates attestations |
| `secrets: inherit` | Access CI platform secrets | Optional; currently unused |

---

## Testing the Integration

### 1. Verify Workflow Visibility

In test consumer repo, check that the workflow is recognized:

```bash
# Should list the CI workflow
gh workflow list -R PoliticalSphere/test-consumer-repo

# Example output:
# CI       active  ...
```

### 2. Trigger a Test Run

```bash
# Create a test branch and PR
git checkout -b test/ci-integration
printf '# Test\n' >> README.md
git add README.md
git commit -m "test: ci integration"
git push origin test/ci-integration

# Open PR via GitHub UI or CLI
gh pr create --title "Test CI integration" --body "Testing workflow_call"
```

### 3. Monitor Execution

In the PR, watch the "Checks" tab. You should see:

```text
✓ Secrets Detection (gitleaks)
✓ Action Pinning Validation
✓ Lint & Format (Biome)
○ Static Analysis (ESLint)   [running]
...
```

### 4. Inspect Logs

Click on any failed check to see detailed logs from the CI platform's linters.

---

## Success Criteria (Phase 1.1)

- [x] Test consumer repo has `.github/workflows/ci.yml` with `workflow_call`
- [x] CI workflow executes without duplication of linter configs
- [x] All 12 linters run on every PR in test consumer repo
- [x] Policy engine placeholder runs (will enforce once activated)
- [x] Logs are captured and viewable in PR checks
- [x] Versioning contract is documented and enforced via branch protection

---

## Troubleshooting

### Problem: "Workflow file not found"

**Cause**: SHA or branch ref is incorrect.

**Solution**:

```bash
# Verify ref exists in CI platform
git ls-remote --refs https://github.com/PoliticalSphere/ci.git main

# Use the correct SHA or branch name
uses: PoliticalSphere/ci/.github/workflows/ci.yml@<correct-sha>
```

### Problem: "Permission denied: pull-requests"

**Cause**: Consumer workflow didn't grant `pull-requests: read` permission.

**Solution**:

```yaml
jobs:
  ci:
    uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
    permissions:
      contents: read
      pull-requests: read  # Add this
```

### Problem: "Runner failed with: Resource not accessible by integration"

**Cause**: Secrets or permissions not passed correctly.

**Solution**:

```yaml
jobs:
  ci:
    uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
    permissions:
      contents: read
      pull-requests: read
    secrets: inherit  # Pass parent secrets if needed
```

### Problem: Linter runs but configuration is wrong

**Cause**: Linter config files are not being found.

**Solution**: The CI platform linter configs are defined in `PoliticalSphere/ci`. They apply to your consumer repo's code. If you need custom rules:

1. Create `.eslintrc.js` or similar in your consumer repo
2. Your config will **override** the CI platform defaults for your code only
3. Report issues to the CI platform team if you need platform-wide rule changes

---

## Advanced: Custom Inputs

The workflow accepts optional inputs:

```yaml
jobs:
  ci:
    uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
    with:
      skip-policy: false  # Set to true to skip policy evaluation for testing
    permissions:
      contents: read
      pull-requests: read
```

### Available Inputs

| Input | Type | Default | Purpose |
| --- | --- | --- | --- |
| `skip-policy` | boolean | `false` | Skip policy evaluation (testing only) |

---

## Next Steps After Integration

Once Phase 1.1 is complete:

### Phase 1.2: Policy Engine Activation

- Wire TypeScript policy engine into workflow
- Parse PR body attestations
- Enforce policy decisions (deny/warn/allow)

### Phase 1.3: Branch Protection Rules

- Set up GitHub branch protection
- Link policy decisions to merge gates
- Define escalation paths for `warn` decisions

### Phase 2: Attestation Hardening

- Implement PR body parsing at workflow runtime
- Log attestation decisions with audit trail
- Enforce that high-risk changes have complete attestations

---

## FAQ

**Q: Do I need to copy linter configs to my consumer repo?**  
A: No. The CI platform's configs apply to your code. Only create local configs if you need custom rules that override the platform defaults.

**Q: What if my repo uses a different Node version?**  
A: The workflow uses Node 22.21.1 (from the CI platform's engines.node). If your repo needs a different version, override in your consumer workflow before calling the reusable workflow.

**Q: Can I run CI on a different branch (not `main`)?**  
A: Yes. Modify your consumer workflow's `on.pull_request.branches` trigger. The CI platform workflow will run regardless.

**Q: What if a linter rule is too strict for my repo?**  
A: File an issue with the CI platform team. If it's a false positive, we can adjust the platform rule. If it's a legitimate difference, create a local config override in your repo.

**Q: How often should I update the ref from `@main` to a tagged version?**  
A: After Phase 1 is complete and v1.0.0 is released. For now, using `@main` is safe since we're in bootstrap (v0.0.1).

---

## Document Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0 | 2026-01-07 | Initial integration guide for Phase 1.1 |

**Next Update**: After v1.0.0 release (Phase 1 completion)
