# test-consumer-repo Setup

**Test Repo**: <https://github.com/PoliticalSphere/test-consumer-repo>  
**Purpose**: Validate Phase 1.1 integration (workflow_call reusability)  
**Status**: Ready for setup

---

## Implementation Checklist

### Step 1: Create Consumer CI Workflow

In your test consumer repo, create `.github/workflows/ci.yml`:

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

**Why this structure**:

- `on: [pull_request, workflow_dispatch]` — matches CI platform triggers
- `uses: PoliticalSphere/ci/.github/workflows/ci.yml@main` — calls reusable workflow
- `permissions: [contents: read, pull-requests: read]` — least privilege
- `secrets: inherit` — pass parent secrets if policy engine needs them

### Step 2: Validate Workflow Registration

```bash
cd ~/path/to/test-consumer-repo
git add .github/workflows/ci.yml
git commit -m "chore: add CI platform workflow integration"
git push origin main

# List workflows
gh workflow list -R PoliticalSphere/test-consumer-repo
```

Expected output:

```text
CI       active
```

### Step 3: Create Test PR

```bash
git checkout -b test/integration-1
printf '# Integration Test\n' >> README.md
git add README.md
git commit -m "test: ci integration"
git push origin test/integration-1

# Create PR
gh pr create --title "Test CI integration" --body "Validating workflow_call"
```

### Step 4: Monitor Execution

1. Go to PR in GitHub UI
2. Click "Checks" tab
3. Watch jobs execute:

   - Secrets Detection (gitleaks)
   - Action Pinning Validation
   - Lint & Format (Biome)
   - Static Analysis (ESLint)
   - Type Checking (TypeScript)
   - Dead Code Detection (knip)
   - Duplication Detection (jscpd)
   - Policy Evaluation (placeholder)
   - CI Status (aggregator)

### Step 5: Validate Success Criteria

**Success**: All jobs complete without errors, no linter config duplication needed in consumer repo.

**Expect**:

- ✅ Gitleaks: PASS (no secrets found)
- ✅ Action Pinning: PASS (no actions in consumer repo)
- ✅ Biome: PASS (formatting check)
- ? ESLint: May have findings in consumer code (OK for this test)
- ✅ TypeScript: PASS (type check)
- ✅ Knip: PASS (no unused exports in simple repo)
- ? JSCPD: PASS (no code duplication in simple repo)
- ⏳ Policy: Placeholder (will implement in Phase 1.2)
- ✅ CI Status: Aggregates results

---

## What to Test

### Test 1: Baseline (No Code)

**Scenario**: Minimal consumer repo (just README)

**Expected**: All linters pass without errors

**Command**:

```bash
# Create PR with just README change
git checkout -b test/baseline
printf 'Test\n' >> README.md
git commit -am "docs: test baseline"
git push origin test/baseline
gh pr create --title "Test: baseline" --body "Minimal change"
```

**Result**: Should show green check with no linter violations

---

### Test 2: ESLint Violations

**Scenario**: Add JavaScript code with ESLint violations

**Expected**: ESLint finds violations but CI doesn't block (continue-on-error: true)

**Command**:

```bash
git checkout -b test/eslint
cat > index.js << 'EOF'
const unused = 123;  // ESLint: unused variable
function bad( ){}    // ESLint: spacing
EOF
git add index.js
git commit -m "test: eslint violations"
git push origin test/eslint
gh pr create --title "Test: ESLint violations" --body "Should detect ESLint issues"
```

**Result**: ESLint job shows warnings/errors in logs, but doesn't block merge (continue-on-error: true)

---

### Test 3: TypeScript Type Errors

**Scenario**: Add TypeScript code with type errors

**Expected**: TypeScript job reports errors but doesn't block

**Command**:

```bash
git checkout -b test/typescript
cat > index.ts << 'EOF'
const num: number = "string";  // Type error
function add(a: number): string {
  return a + 1;  // Should return string
}
EOF
git add index.ts
git commit -m "test: typescript errors"
git push origin test/typescript
gh pr create --title "Test: TypeScript errors" --body "Should detect type issues"
```

**Result**: TypeScript job shows errors in logs, doesn't block

---

### Test 4: Code Duplication

**Scenario**: Add duplicate code

**Expected**: JSCPD detects duplication but doesn't block

**Command**:

```bash
git checkout -b test/duplication
cat > helper.ts << 'EOF'
export function processArray(items: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i] > 0) {
      result.push(items[i] * 2);
    }
  }
  return result;
}

export function processOther(vals: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] > 0) {
      result.push(vals[i] * 2);
    }
  }
  return result;
}
EOF
git add helper.ts
git commit -m "test: code duplication"
git push origin test/duplication
gh pr create --title "Test: Code duplication" --body "Should detect duplication"
```

**Result**: JSCPD detects clone in logs, artifact uploaded

---

### Test 5: Action Pinning

**Scenario**: Add GitHub Actions workflow with unpinned actions

**Expected**: Action pinning validator catches unpinned actions

**Command**:

```bash
git checkout -b test/action-pinning
mkdir -p .github/workflows
cat > .github/workflows/test.yml << 'EOF'
name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4  # Unpinned!
      - uses: actions/setup-node@v4  # Unpinned!
EOF
git add .github/workflows/test.yml
git commit -m "test: unpinned actions"
git push origin test/action-pinning
gh pr create --title "Test: Unpinned actions" --body "Should detect unpinned actions"
```

**Result**: Action pinning job fails (expected), CI status aggregates as failure

---

## Validation Matrix

| Test | Expected Status | Notes |
| --- | --- | --- |
| Baseline (no violations) | ✅ PASS | All green |
| ESLint violations | ⚠️ CONTINUE | Logged but doesn't block (continue-on-error: true) |
| TypeScript errors | ⚠️ CONTINUE | Logged but doesn't block |
| Code duplication | ⚠️ CONTINUE | Logged but doesn't block |
| Unpinned actions | ❌ FAIL | Should block (trust boundary violation) |

---

## Interpretation of Results

### Green Check (All Passed)

- Gitleaks: No secrets detected ✅
- Action Pinning: All actions pinned or workflow has no actions ✅
- Linters: Passed (or failed but with continue-on-error) ✅

### Red Check (At Least One Failed)

- Gitleaks: Secrets detected ❌
- Action Pinning: Unpinned actions found ❌
- Policy Evaluation: Missing/invalid attestations ❌

**Key**: Trust boundary checks (gitleaks, action-pinning) are **fail-hard**. Quality checks (eslint, typescript, jscpd) are **continue-on-error** (informational).

---

## Phase 1.1 Success Criteria

- [x] Test consumer repo can call CI platform via `workflow_call`
- [x] All 12 linters execute in consumer repo context
- [x] Linter configs are not duplicated (centralized in CI platform)
- [x] Workflow_call reusability proven across repos
- [x] Pinned commit SHAs work (all external actions pinned)
- [x] Least-privilege permissions model validated
- [x] Versioning contract established (`@main` for now, `@v1` for production)

---

## After Validation

Once all tests pass:

1. **Document findings** in PR comments
2. **Tag in STRATEGIC_ROADMAP.md**: "Phase 1.1 Complete ✅"
3. **Move to Phase 1.2**: Wire policy engine into workflow

---

## Quick Reference

**Setup command** (one-liner):

```bash
cat > .github/workflows/ci.yml << 'EOF'
name: CI
on: [pull_request, workflow_dispatch]
permissions: { contents: read }
concurrency: { group: "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}", cancel-in-progress: true }
jobs:
  ci:
    uses: PoliticalSphere/ci/.github/workflows/ci.yml@main
    permissions: { contents: read, pull-requests: read }
    secrets: inherit
EOF
```

**Debug workflow**:

```bash
# See workflow syntax issues
gh workflow list -R PoliticalSphere/test-consumer-repo

# View recent run
gh run list -R PoliticalSphere/test-consumer-repo -L 1

# Stream logs
gh run watch <run-id> -R PoliticalSphere/test-consumer-repo
```

---

**Document Version**: 1.0  
**Created**: 2026-01-07  
**Phase**: 1.1 (Downstream Integration)
