# Phase 1.1: Downstream Integration — Complete Implementation Package

**Status**: Ready to Execute  
**Target Repo**: <https://github.com/PoliticalSphere/test-consumer-repo>  
**Phase**: 1.1 of 5 (Upstream Consumption)  
**Timeline**: 3-7 days

---

## What You're Implementing

The test consumer repo will invoke the CI platform via `workflow_call`, proving that:

1. ✅ Reusable workflows work across repos
2. ✅ Linter configs are centralized (no duplication)
3. ✅ Permissions are least-privileged
4. ✅ Versioning contract can be enforced
5. ✅ Consumer repos have zero CI boilerplate

---

## Documentation Structure

### For Quick Setup (Start Here)

1. **[DEPLOY_CONSUMER_WORKFLOW.md](DEPLOY_CONSUMER_WORKFLOW.md)** — Copy-paste workflow YAML (5 min)
2. **[PHASE_1_1_CHECKLIST.md](PHASE_1_1_CHECKLIST.md)** — Execution checklist with tests (2-3 days)

### For Understanding the Model

1. **[CONSUMER_INTEGRATION_GUIDE.md](CONSUMER_INTEGRATION_GUIDE.md)** — Full integration guide, FAQ, troubleshooting
2. **[TEST_CONSUMER_SETUP.md](TEST_CONSUMER_SETUP.md)** — Detailed test scenarios with expected outcomes

### For Strategic Context

1. **[STRATEGIC_ROADMAP.md](STRATEGIC_ROADMAP.md)** — 5-phase roadmap (Phase 1.1 now in progress)

---

## Getting Started (5 Minutes)

### 1. Copy Workflow YAML

Go to: [DEPLOY_CONSUMER_WORKFLOW.md](DEPLOY_CONSUMER_WORKFLOW.md)

Copy the YAML block to `test-consumer-repo/.github/workflows/ci.yml`

```bash
cd ~/path/to/test-consumer-repo
mkdir -p .github/workflows
cat > .github/workflows/ci.yml << 'EOF'
# [Copy the YAML from DEPLOY_CONSUMER_WORKFLOW.md]
EOF
```

### 2. Commit and Push

```bash
git add .github/workflows/ci.yml
git commit -m "chore: integrate Political Sphere CI platform"
git push origin main
```

### 3. Verify Workflow Registered

```bash
gh workflow list -R PoliticalSphere/test-consumer-repo
# Should show: CI    active
```

### 4. Create Test PR

```bash
git checkout -b test/integration-baseline
printf '# Integration Test\n' >> README.md
git commit -am "test: ci integration"
git push origin test/integration-baseline
gh pr create --title "Test CI integration" --body "Validating workflow_call"
```

### 5. Watch Checks

Go to PR → "Checks" tab → Watch the 9 jobs execute

---

## Success Indicators

✅ **Immediate (Job execution)**

- All 9 linters run in consumer repo context
- Logs show commands from CI platform (e.g., `npm run lint:biome`)
- No configuration files needed in consumer repo

✅ **After Tests (Validation)**

- Baseline PR gets green check (no violations)
- ESLint violations are logged but don't block
- Unpinned actions trigger failure (as expected)
- JSCPD detects duplication (as expected)

✅ **Completion (Documentation)**

- All 5 test scenarios pass
- Screenshots captured in PR comment
- STRATEGIC_ROADMAP.md updated to "Phase 1.1 Complete ✅"

---

## Testing Scenarios

### Test 1: Baseline (Green)

Minimal code change → All checks pass

### Test 2: ESLint Violations (Yellow)

Add JavaScript with linting errors → Found but doesn't block

### Test 3: TypeScript Errors (Yellow)

Add TypeScript with type errors → Found but doesn't block

### Test 4: Code Duplication (Yellow)

Add duplicate code blocks → Found but doesn't block

### Test 5: Unpinned Actions (Red)

Add unpinned GitHub Action → **Blocks merge**

Details: [TEST_CONSUMER_SETUP.md](TEST_CONSUMER_SETUP.md)

---

## Key Concepts

### Reusable Workflow (workflow_call)

A GitHub workflow in one repo that can be called by another repo.

```yaml
# In PoliticalSphere/ci/.github/workflows/ci.yml
on:
  workflow_call:  # <-- Makes it reusable

# In test-consumer-repo/.github/workflows/ci.yml
uses: PoliticalSphere/ci/.github/workflows/ci.yml@main  # <-- Calls it
```

### Centralized Config

All linter configs live in CI platform. Consumer repos inherit them. No duplication.

### Least Privilege Permissions

Consumer workflow only grants `contents: read` and `pull-requests: read`. No `write` permissions.

### Versioning Contract

- **Testing**: Pin to `@main` (follows bleeding edge)
- **Production**: Pin to `@v1` (stable major version)
- **Security**: Pin to `@<SHA>` (exact commit)

---

## Troubleshooting

| Issue | Fix |
| --- | --- |
| "Workflow not found" | Verify SHA/branch: `git ls-remote https://github.com/PoliticalSphere/ci.git main` |
| "Permission denied: pull-requests" | Add `pull-requests: read` to consumer workflow permissions |
| "Jobs not running" | Check syntax: `gh workflow list -R PoliticalSphere/test-consumer-repo` |
| Linter config not found | That's expected! Configs are in CI platform repo, not consumer |
| Action pinning not detected | Test scenario works; unpinned actions should fail as expected |

Full troubleshooting: [CONSUMER_INTEGRATION_GUIDE.md](CONSUMER_INTEGRATION_GUIDE.md#troubleshooting)

---

## Timeline

| Day | Task | Duration |
| --- | --- | --- |
| Day 1 (Setup) | Copy workflow YAML, commit, verify registration | 5-15 min |
| Day 1 (Baseline) | Create baseline test PR, verify green check | 10-15 min |
| Day 2 (Validation) | Run test scenarios 2-5, capture results | 60-90 min |
| Day 3 (Documentation) | Document findings, take screenshots, update roadmap | 30-45 min |
| **Total** | | **2-3 hours of work** |

---

## File Checklist (Created for Phase 1.1)

✅ [DEPLOY_CONSUMER_WORKFLOW.md](DEPLOY_CONSUMER_WORKFLOW.md) — Ready-to-copy YAML  
✅ [CONSUMER_INTEGRATION_GUIDE.md](CONSUMER_INTEGRATION_GUIDE.md) — Full integration guide  
✅ [TEST_CONSUMER_SETUP.md](TEST_CONSUMER_SETUP.md) — Test scenario walkthroughs  
✅ [PHASE_1_1_CHECKLIST.md](PHASE_1_1_CHECKLIST.md) — Day-by-day checklist  
✅ This file — Overview and navigation

---

## What Happens After Phase 1.1

Once this is complete:

**Phase 1.2**: Wire policy engine into workflow

- Parse PR body for attestations
- Generate policy decisions (allow/deny/warn)
- Enforce decisions in CI status

**Phase 1.3**: Branch protection rules

- Require CI to pass before merge
- Link policy decisions to merge gates
- Define escalation paths for warnings

**Phase 2+**: See [STRATEGIC_ROADMAP.md](STRATEGIC_ROADMAP.md) for Phases 2-5

---

## Success Criteria (Phase 1.1)

- [x] Documentation complete (5 files created)
- [ ] Test consumer repo has workflow file
- [ ] All 5 test scenarios validated
- [ ] Linter config centralization verified (0 configs in consumer)
- [ ] Versioning contract proven (@main works)
- [ ] Least-privilege permissions validated
- [ ] STRATEGIC_ROADMAP.md updated to "Complete ✅"

---

## Communication

When Phase 1.1 is complete, create a PR to CI platform with:

**Title**: `docs: phase 1.1 downstream integration complete`

**Body**:

```markdown
# Phase 1.1 Complete: Downstream Integration Validated

## What Was Accomplished
- ✅ Test consumer repo successfully calls CI platform via workflow_call
- ✅ All 12 linters execute with zero config duplication
- ✅ Pinned SHAs and least-privilege permissions validated
- ✅ Versioning contract (@main → @v1) established and documented
- ✅ 5 test scenarios pass with expected outcomes

## Documentation Created
- [DEPLOY_CONSUMER_WORKFLOW.md](DEPLOY_CONSUMER_WORKFLOW.md)
- [CONSUMER_INTEGRATION_GUIDE.md](CONSUMER_INTEGRATION_GUIDE.md)
- [TEST_CONSUMER_SETUP.md](TEST_CONSUMER_SETUP.md)
- [PHASE_1_1_CHECKLIST.md](PHASE_1_1_CHECKLIST.md)

## Test Results
[Attach screenshots here]

## Next: Phase 1.2
Ready to advance to policy engine activation in .github/workflows/ci.yml
```

---

## Quick Links

**Start Here**: [DEPLOY_CONSUMER_WORKFLOW.md](DEPLOY_CONSUMER_WORKFLOW.md)  
**Track Progress**: [PHASE_1_1_CHECKLIST.md](PHASE_1_1_CHECKLIST.md)  
**Reference**: [CONSUMER_INTEGRATION_GUIDE.md](CONSUMER_INTEGRATION_GUIDE.md)  
**Strategic Context**: [STRATEGIC_ROADMAP.md](STRATEGIC_ROADMAP.md)  
**Test Details**: [TEST_CONSUMER_SETUP.md](TEST_CONSUMER_SETUP.md)

---

**Implementation Package Version**: 1.0  
**Created**: 2026-01-07  
**Status**: Ready to Deploy  
**Estimated Duration**: 2-3 hours of work over 3 days
