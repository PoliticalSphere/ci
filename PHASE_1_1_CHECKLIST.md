# Phase 1.1 Implementation Checklist

**Objective**: Validate that test consumer repo can call CI platform via `workflow_call` without config duplication

**Start Date**: 2026-01-07  
**Target Completion**: 2026-01-10

---

## Setup Phase (Day 1)

- [ ] Copy workflow YAML to test consumer repo (`.github/workflows/ci.yml`)
  - Reference: `CONSUMER_INTEGRATION_GUIDE.md` → Quick Start section
  - Verify: `gh workflow list` shows "CI" workflow

- [ ] Commit and push workflow file
  - `git add .github/workflows/ci.yml`
  - `git commit -m "chore: add CI platform workflow integration"`
  - `git push origin main`

- [ ] Create baseline test PR
  - `git checkout -b test/integration-1`
  - `printf '# Integration Test\n' >> README.md`
  - `git push origin test/integration-1`
  - `gh pr create --title "Test CI integration" --body "Validating workflow_call"`

---

## Validation Phase (Day 1-2)

### Test 1: Baseline (No Violations)

- [ ] Baseline PR created (minimal change)
- [ ] All jobs executed successfully
- [ ] Expected green check: ✅
- [ ] No linter config files in consumer repo
- [ ] Logs show linters running from CI platform

**Document**: Screenshot of passing checks

---

### Test 2: ESLint Violations

- [ ] ESLint test PR created (intentional violations)
  - Reference: `TEST_CONSUMER_SETUP.md` → Test 2
- [ ] ESLint job reports findings but doesn't block
- [ ] Status: ⚠️ Continue (continue-on-error: true)

**Document**: Screenshot of ESLint findings in logs

---

### Test 3: TypeScript Type Errors

- [ ] TypeScript test PR created (intentional type errors)
  - Reference: `TEST_CONSUMER_SETUP.md` → Test 3
- [ ] TypeScript job reports errors but doesn't block
- [ ] Status: ⚠️ Continue

**Document**: Screenshot of TypeScript errors in logs

---

### Test 4: Code Duplication

- [ ] Duplication test PR created (duplicated code blocks)
  - Reference: `TEST_CONSUMER_SETUP.md` → Test 4
- [ ] JSCPD detects duplication
- [ ] Status: ⚠️ Continue
- [ ] Artifact uploaded (jscpd-report.md)

**Document**: Screenshot of JSCPD findings

---

### Test 5: Unpinned GitHub Actions

- [ ] Action pinning test PR created (unpinned actions)
  - Reference: `TEST_CONSUMER_SETUP.md` → Test 5
- [ ] Action pinning validator detects violation
- [ ] Status: ❌ FAIL (blocks merge)

**Document**: Screenshot of failed action pinning check

---

## Verification Phase (Day 2-3)

### Reusability Checks

- [ ] Verify no linter config files needed in consumer repo
  - Consumer should NOT have: `.eslintrc.js`, `biome.json`, `tsconfig.json`, etc.
  - These live in CI platform repo only

- [ ] Verify pinned SHA consistency
  - Run: `grep -r "uses:" .github/workflows/ci.yml | grep -v "^#"`
  - All external actions should have 40-character SHA

- [ ] Verify least-privilege permissions
  - Consumer workflow has: `permissions: { contents: read, pull-requests: read }`
  - No `write` permissions needed for read-only checks

### Workflow_call Reusability Validation

- [ ] Test consumer repo can call CI platform from `@main` branch
- [ ] Test consumer repo can call CI platform from commit SHA (try `@<main-sha>`)
- [ ] Verify same workflow logic executes in both contexts
- [ ] No configuration duplication between repos

---

## Success Criteria Validation (Day 3)

### Must-Have

- [ ] All 9 linters execute in consumer repo context
- [ ] Zero linter config files in consumer repo (all centralized)
- [ ] Trust boundary checks (gitleaks, action-pinning) are fail-hard
- [ ] Quality checks (eslint, typescript, jscpd) are continue-on-error
- [ ] Policy placeholder job executes

### Nice-to-Have

- [ ] Workflow executes consistently (<2 min runtime)
- [ ] Logs are clear and actionable
- [ ] Consumer can override configs if needed (create local .eslintrc, etc.)

---

## Completion Tasks

- [ ] **Document results**: Create PR to CI platform with findings
  - Title: "docs: phase 1.1 integration validation complete"
  - Body: Summary of tests, screenshots, lessons learned

- [ ] **Update STRATEGIC_ROADMAP.md**: Mark Phase 1.1 complete
  - Change status from 🟡 IN PROGRESS to ✅ COMPLETE

- [ ] **Move to Phase 1.2**: Wire policy engine into workflow
  - Reference: `STRATEGIC_ROADMAP.md` → Phase 1.2 section
  - Start date: 2026-01-10

---

## Troubleshooting Quick Reference

| Problem | Solution |
| --- | --- |
| "Workflow not found" | Check SHA/branch is correct: `git ls-remote https://github.com/PoliticalSphere/ci.git main` |
| "Permission denied" | Add `pull-requests: read` to consumer workflow permissions |
| "Actions not running" | Verify `.github/workflows/ci.yml` syntax: `gh workflow list` |
| Linter config not found | Configs are in CI platform repo; consumer only runs them |
| Unpinned action not detected | Add unpinned action to `.github/workflows/test.yml` in consumer PR |

---

## Documentation Files

Created:

- ✅ [CONSUMER_INTEGRATION_GUIDE.md](CONSUMER_INTEGRATION_GUIDE.md) — How to integrate any consumer repo
- ✅ [TEST_CONSUMER_SETUP.md](TEST_CONSUMER_SETUP.md) — Specific setup for test consumer repo
- ✅ Phase 1.1 Implementation Checklist (this file)

---

## Key Metrics (Post-Completion)

| Metric | Expected Value |
| --- | --- |
| Linter execution time | <2 minutes |
| Number of config files in consumer | 0 (all centralized) |
| Test coverage of Phase 1.1 | 100% (5/5 test scenarios pass) |
| Workflow reusability demos | 1+ (test-consumer-repo) |
| Breaking changes introduced | 0 (backward compatible) |

---

## Sign-Off

- [ ] All tests pass
- [ ] Documentation complete
- [ ] Ready to advance to Phase 1.2

**Completed By**: ___________________  
**Date**: ___________________  
**Sign-Off**: ___________________

---

**Checklist Version**: 1.0  
**Created**: 2026-01-07  
**Phase**: 1.1 (Downstream Integration)
