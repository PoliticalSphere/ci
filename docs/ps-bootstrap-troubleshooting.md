# PS-Bootstrap Troubleshooting Guide

## Overview

This guide provides solutions to common issues encountered when using ps-bootstrap actions. All composite bootstrap actions follow consistent validation patterns and emit structured error messages.

---

## Quick Diagnosis

### Check Validation Timing

If bootstrap seems slow, check performance metrics:

```bash
# After ps-init runs, check timing in workflow logs:
grep "PS_.*_VALIDATION_DURATION_SEC" $GITHUB_ENV
```

**Expected timings**:
- `PS_INIT_VALIDATION_DURATION_SEC`: < 2 seconds
- `PS_NODE_VALIDATION_DURATION_SEC`: < 1 second

### Enable Debug Logging

For detailed diagnostics:

```yaml
- uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
  env:
    RUNNER_DEBUG: 1  # Enable GitHub Actions debug mode
```

---

## Common Issues

### 1. Input Validation Failures

#### Error: "must be 0/1/true/false"

**Symptom**:
```
ERROR: inputs.home_isolation must be 0/1/true/false (got 'True')
```

**Cause**: Boolean inputs are case-sensitive in YAML but normalized by validation.

**Solution**:
```yaml
# ✅ Correct
home_isolation: "true"   # or "false", "1", "0"

# ❌ Incorrect
home_isolation: True     # Capital T not quoted
home_isolation: yes      # Use "true" instead
```

#### Error: "must be a non-negative integer"

**Symptom**:
```
ERROR: inputs.fetch_depth must be a non-negative integer (got 'full')
```

**Cause**: Numeric validation failed.

**Solution**:
```yaml
# ✅ Correct
fetch_depth: "0"         # Full history
fetch_depth: "1"         # Shallow clone

# ❌ Incorrect
fetch_depth: full
fetch_depth: -1
```

#### Error: "must be OWNER/REPO"

**Symptom**:
```
ERROR: inputs.platform_repo must be OWNER/REPO (got 'ci-platform')
```

**Cause**: Repository format validation failed.

**Solution**:
```yaml
# ✅ Correct
platform_repo: "PoliticalSphere/ci"

# ❌ Incorrect
platform_repo: "ci"                    # Missing owner
platform_repo: "PoliticalSphere/ci/"   # Trailing slash
```

---

### 2. Path Validation Failures

#### Error: "must be a repo-relative safe path"

**Symptom**:
```
ERROR: inputs.platform_path must be a repo-relative safe path (got '../platform')
```

**Cause**: Path traversal attempt detected.

**Solution**:
```yaml
# ✅ Correct
platform_path: ".ps-platform"
platform_path: "tools/platform"

# ❌ Incorrect
platform_path: "../platform"      # Path traversal
platform_path: "/tmp/platform"    # Absolute path
platform_path: "foo/../../etc"    # Traversal segment
```

**Security note**: All paths must be repository-relative and cannot escape the workspace.

#### Error: "must not contain '..'"

**Symptom**:
```
ERROR: inputs.install_dir must be a repo-relative safe path (no '..' or absolute paths allowed)
```

**Cause**: Strict validation mode forbids any ".." substring.

**Solution**:
```yaml
# ✅ Correct
install_dir: ".tooling/bin"
install_dir: "tools/bin"

# ❌ Incorrect
install_dir: "..tooling"          # Contains ".."
install_dir: "tools/../bin"       # Contains ".."
```

---

### 3. Package Manager Issues

#### Error: "package.json not found"

**Symptom**:
```
ERROR: package.json not found at /workspace/./package.json
HINT: ensure checkout ran and the package.json exists at the working directory.
```

**Cause**: Package file missing or incorrect `working_directory`.

**Solution**:

1. **Ensure checkout ran first**:
   ```yaml
   steps:
     - uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
     # Checkout must run before ps-node
     - uses: ./.github/actions/ps-bootstrap/ps-node
   ```

2. **Check working_directory**:
   ```yaml
   # ✅ Correct
   - uses: ./.github/actions/ps-bootstrap/ps-node
     with:
       working_directory: "packages/app"  # If package.json is here
   
   # ❌ Incorrect
   - uses: ./.github/actions/ps-bootstrap/ps-node
     with:
       working_directory: "."             # But package.json is in subfolder
   ```

#### Error: "package-lock.json not found"

**Symptom**:
```
ERROR: package-lock.json not found (npm ci requires a lockfile for determinism).
HINT: commit package-lock.json or set install_dependencies=0 (and handle installs elsewhere).
```

**Cause**: Lockfile missing (required for `npm ci`).

**Solution**:

**Option 1**: Commit lockfile (recommended):
```bash
npm install
git add package-lock.json
git commit -m "Add package-lock.json for deterministic installs"
```

**Option 2**: Disable automatic install:
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-node
  with:
    install_dependencies: "0"  # Handle installs manually
```

---

### 4. Fetch Depth Conflicts

#### Error: "full history required but fetch_depth=1"

**Symptom**:
```
ERROR: full history required but fetch_depth=1 (expected 0)
```

**Cause**: Conflicting requirements - `require_full_history=true` but shallow clone requested.

**Solution**:
```yaml
# ✅ Correct
- uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
  with:
    fetch_depth: "0"              # Full history
    require_full_history: "true"

# ❌ Incorrect
- uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
  with:
    fetch_depth: "1"              # Shallow
    require_full_history: "true"  # Requires full
```

**When to use**:
- `fetch_depth: "0"` - For versioning, changelogs, git-based tools
- `fetch_depth: "1"` - For fast CI builds (default)

---

### 5. Platform Checkout Issues

#### Error: "platform_repo owner must be PoliticalSphere unless allowlisted"

**Symptom**:
```
ERROR: inputs.repository owner must be PoliticalSphere unless allowlisted (got external/repo)
```

**Cause**: Security safeguard - only PoliticalSphere repos allowed by default.

**Solution**:

**Option 1**: Use PoliticalSphere repo:
```yaml
platform_repo: "PoliticalSphere/ci"
```

**Option 2**: Add to allowlist:
```yaml
platform_repo: "external/repo"
platform_allowed_repositories: |
  external/repo
  another/allowed-repo
```

#### Error: "repository X not in allowed_repositories allowlist"

**Symptom**:
```
ERROR: repository external/repo not in allowed_repositories allowlist
```

**Cause**: Repository not in provided allowlist.

**Solution**: Add repository to allowlist:
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-checkout-platform
  with:
    repository: "external/repo"
    allowed_repositories: |
      external/repo
      another/trusted-repo
```

---

### 6. Tools Installation Failures

#### Error: "no tools selected (bundle=none and extra_tools empty)"

**Symptom**:
```
ERROR: no tools selected (bundle=none and extra_tools empty). If you intended to provide explicit tools, use the 'tools' input.
```

**Cause**: Tools action invoked but no tools specified.

**Solution**:

**Option 1**: Use a bundle:
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-tools
  with:
    bundle: "lint"      # or "security"
```

**Option 2**: Specify explicit tools:
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-tools
  with:
    bundle: "none"
    extra_tools: |
      shellcheck
      actionlint
```

**Option 3**: Use explicit tools input:
```yaml
- uses: ./.github/actions/ps-bootstrap/ps-tools
  with:
    tools: "shellcheck,actionlint"
```

#### Error: "invalid tool id in inputs.extra_tools"

**Symptom**:
```
ERROR: invalid tool id in inputs.extra_tools: my_Tool (allowed: lowercase letters, digits, hyphen)
```

**Cause**: Tool IDs must be lowercase alphanumeric with hyphens only.

**Solution**:
```yaml
# ✅ Correct
extra_tools: |
  shellcheck
  markdown-lint
  action-lint

# ❌ Incorrect
extra_tools: |
  ShellCheck      # Uppercase
  markdown_lint   # Underscore
  action lint     # Space
```

---

## Performance Optimization

### Reduce Validation Time

1. **Cache validation dependencies**:
   ```yaml
   - uses: actions/cache@v4
     with:
       path: ~/.cache/ps-validation
       key: validation-${{ runner.os }}
   ```

2. **Skip unnecessary validations**:
   ```yaml
   - uses: ./.github/actions/ps-bootstrap/ps-initialize-environment
     with:
       skip_platform_checkout: "1"  # If platform not needed
       install_tools: "0"            # If tools not needed
   ```

3. **Use shallow clones when possible**:
   ```yaml
   fetch_depth: "1"  # Default, fastest
   ```

### Monitor Performance

Check timing metrics emitted to `$GITHUB_ENV`:
- `PS_INIT_VALIDATION_DURATION_SEC`
- `PS_NODE_VALIDATION_DURATION_SEC`

Add to workflow summary:
```yaml
- name: Report validation timing
  if: always()
  run: |
    echo "## Validation Performance" >> $GITHUB_STEP_SUMMARY
    echo "Init: ${PS_INIT_VALIDATION_DURATION_SEC}s" >> $GITHUB_STEP_SUMMARY
    echo "Node: ${PS_NODE_VALIDATION_DURATION_SEC}s" >> $GITHUB_STEP_SUMMARY
```

---

## Getting Help

### Debug Checklist

Before opening an issue:

1. ✅ Check error message for HINT section
2. ✅ Verify all input values are quoted strings
3. ✅ Confirm paths are repo-relative
4. ✅ Review this troubleshooting guide
5. ✅ Enable `RUNNER_DEBUG: 1` for detailed logs

### Reporting Issues

Include in bug reports:

```markdown
**Action**: ps-bootstrap/[action-name]

**Error Message**:
```
[paste full error output]
```

**Action Configuration**:
```yaml
[paste action step with all inputs]
```

**Environment**:
- Runner OS: [ubuntu-latest/macos-latest/windows-latest]
- Workflow file: [path]
- Validation duration: [check PS_*_VALIDATION_DURATION_SEC]
```

### Contact

- **Documentation**: [docs/composite-actions-guide.md](composite-actions-guide.md)
- **Examples**: [examples/](../examples/)
- **Tests**: [tools/tests/](../tools/tests/)

---

## Appendix: Validation Rules

### Boolean Inputs

Accepted values (case-insensitive):
- True: `1`, `true`, `yes`, `y`, `on`
- False: `0`, `false`, `no`, `n`, `off`, `` (empty)

### Path Inputs

Rules:
- ✅ Must be relative to workspace root
- ✅ No absolute paths (`/...`)
- ✅ No parent directory traversal (`../`)
- ✅ No symbolic links outside workspace
- ✅ Strict mode: No ".." substring anywhere

### Repository Format

Pattern: `OWNER/REPO`
- `OWNER`: Alphanumeric, hyphens, underscores, dots
- `REPO`: Alphanumeric, hyphens, underscores, dots
- Examples: `PoliticalSphere/ci`, `github/actions`

### Numeric Inputs

Rules:
- ✅ Non-negative integers only
- ✅ No decimals: `1.5` ❌
- ✅ No scientific notation: `1e10` ❌
- ✅ Range: `0` to `2147483647`

---

## Related Documentation

- [Composite Actions Guide](composite-actions-guide.md) - Complete action reference
- [Integration Guide](integration-guide.md) - Consumer usage patterns
- [Configuration Management](configuration-management-guide.md) - Policy-driven configuration
- [Security Guide](security-enhancements-implementation.md) - Security architecture
