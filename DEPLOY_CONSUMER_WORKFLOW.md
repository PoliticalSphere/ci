# Ready-to-Deploy: Consumer Workflow Configuration

**For**: <https://github.com/PoliticalSphere/test-consumer-repo>  
**File**: `.github/workflows/ci.yml`  
**Action**: Copy and commit this file to your test consumer repo

---

## Copy This Entire Block

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

---

## Step-by-Step Setup

### In test-consumer-repo root directory

```bash
# 1. Create directories if needed
mkdir -p .github/workflows

# 2. Create the workflow file
cat > .github/workflows/ci.yml << 'EOF'
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
EOF

# 3. Verify the file
cat .github/workflows/ci.yml

# 4. Stage and commit
git add .github/workflows/ci.yml
git commit -m "chore: integrate Political Sphere CI platform

This enables the test consumer repo to use the centralized CI platform
via workflow_call, eliminating configuration duplication.

The CI platform runs all quality and security checks:
- Secrets detection (gitleaks)
- Action pinning validation
- Code formatting (biome)
- Static analysis (eslint)
- Type checking (typescript)
- Dead code detection (knip)
- Code duplication (jscpd)
- Policy evaluation (when activated)

Relates to: PoliticalSphere/ci#Phase-1.1"

# 5. Push to origin
git push origin main

# 6. Verify workflow registration
gh workflow list -R PoliticalSphere/test-consumer-repo
# Expected: CI    active
```

---

## What Happens Next

### Automatic (GitHub handles this)

1. GitHub recognizes the reusable workflow trigger
2. On every PR to `main`, GitHub will invoke the CI platform's workflow
3. The CI platform runs all linters in your consumer repo context
4. Results appear in PR checks

### Manual (You do this)

1. Create a test PR with any change
2. Go to PR → "Checks" tab
3. Watch the 9 jobs execute (takes ~2 min):

   - Secrets Detection ✓
   - Action Pinning ✓
   - Lint & Format ✓
   - Static Analysis ✓
   - Type Checking ✓
   - Dead Code Detection ✓
   - Duplication Detection ✓
   - Policy Evaluation ⏳
   - CI Status ✓

---

## Verification: Quick Commands

After pushing the workflow file:

```bash
# 1. List workflows
gh workflow list -R PoliticalSphere/test-consumer-repo

# Expected output:
# Name   State   Created             Updated             
# CI     active  2026-01-07 12:34:5  2026-01-07 12:34:5

# 2. Create test PR
git checkout -b test/integration-validation
printf '# Test\n' >> README.md
git commit -am "test: validate integration"
git push origin test/integration-validation
gh pr create --title "Test: CI integration" --body "Validating workflow_call"

# 3. Monitor the run
gh run list -R PoliticalSphere/test-consumer-repo -L 1
# Copy the run ID

gh run watch <run-id> -R PoliticalSphere/test-consumer-repo
```

---

## No Config Files Needed

Your test consumer repo should **NOT** have:

- ❌ `.eslintrc.js` or `.eslintrc.json`
- ❌ `biome.json` or `biome.toml`
- ❌ `tsconfig.json` (unless your app needs custom TS config)
- ❌ `.kniprc.json`
- ❌ `.yamllint`
- ❌ `cspell.json`

All these configs live in the CI platform repo (`PoliticalSphere/ci`). Your consumer repo inherits them.

**Exception**: If you need custom linter rules for your repo, create a local config file. It will override the platform defaults for your code only.

---

## Expected Behavior

### Green Check (Successful)

All checks pass when:

- No secrets detected
- No unpinned actions in workflows
- Code is formatted (passes biome)
- May have ESLint/TypeScript warnings (continue-on-error: true)

### Red Check (Failure)

Checks fail when:

- Secrets detected in code
- Unpinned GitHub Actions in workflows
- Policy attestations invalid (once policy engine is active)

### Orange/Yellow (Warnings)

Linters report findings but don't block:

- ESLint violations
- TypeScript type errors
- Code duplication warnings

---

## Debugging: View Detailed Logs

If a check fails:

1. Click the check name in PR
2. Scroll to "Run Political Sphere CI"
3. Expand any job to see full output
4. Search for "Error" or "FAIL" in logs

Example output:

```text
⚠️ Static Analysis (ESLint)
src/index.ts:5:3 - error  'foo' is assigned a value but never used  (no-unused-vars)
```

---

## After Setup: What's Next

Once this works:

1. **Phase 1.2** - Wire policy engine into workflow
   - Parse PR body for attestations
   - Enforce policy decisions (deny/warn/allow)

2. **Phase 2** - Attestation hardening
   - Require attestations for high-risk changes
   - Track AI-assisted changes

3. **Phase 3** - Observability
   - Dashboard showing policy compliance
   - Audit logs of all decisions

---

## Support

If the workflow doesn't trigger:

1. Check `.github/workflows/ci.yml` syntax: `gh workflow list`
2. Verify permissions: `permissions: { contents: read, pull-requests: read }`
3. Check the workflow is using: `uses: PoliticalSphere/ci/.github/workflows/ci.yml@main`
4. View workflow runs: `gh run list -R PoliticalSphere/test-consumer-repo`

---

**Ready**: Copy the YAML block above and commit to `.github/workflows/ci.yml` in test-consumer-repo

**Time to Deploy**: 5 minutes  
**Validation Time**: 2-5 minutes (first PR run)

---

**Document Version**: 1.0  
**Created**: 2026-01-07  
**For**: Phase 1.1 Implementation
