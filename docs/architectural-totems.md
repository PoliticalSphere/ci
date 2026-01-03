# Architectural Totems

This document identifies **exemplar files** that represent best practices and serve as
authoritative references for AI code generation, manual review, and new file creation.

## Document Metadata

- **Created:** 2026-01-02
- **Owner:** DevOps Architect
- **Classification:** Internal
- **Purpose:** Identify gold-standard reference patterns for consistency enforcement

---

## What is a Totem?

A **totem** is an exemplary file that:

- Demonstrates correct structure, conventions, and patterns
- Serves as a template for new files of the same type
- Is actively maintained and updated when standards evolve
- Is referenced by AI assistants during code generation

**Totems are NOT:**

- Immutable (they evolve with standards)
- Configuration files (those go in `/configs`)
- Generated files (those are outputs, not templates)

---

## Totem Registry

### Bash Scripts

| Totem | Path | Purpose |
| --- | --- | --- |
| **Gate Script** | `tools/scripts/gates/gate-pre-commit.sh` | Exemplar for gate entrypoints |
| **Lint Wrapper** | `tools/scripts/lint/biome.sh` | Exemplar for lint tool wrappers |
| **Shared Library** | `tools/scripts/gates/gate-common.sh` | Exemplar for shared bash helpers |

**Pattern Requirements:**

```bash
#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Political Sphere — [Script Title]
# ------------------------------------------------------------------------------
# Purpose:
#   [Single-sentence purpose statement]
#
# Design:
#   - [Key design principle 1]
#   - [Key design principle 2]
# ==============================================================================

# shellcheck source=tools/scripts/[relative/path.sh]
. "${script_dir}/[dependency.sh]"
```

---

### Reusable Workflows

| Totem | Path | Purpose |
| --- | --- | --- |
| **PR Gates** | `.github/workflows/_reusable-pr-gates.yml` | Exemplar for reusable workflows |
| **Caller Workflow** | `.github/workflows/pr-gates.yml` | Exemplar for workflow callers |

**Pattern Requirements:**

```yaml
# ==============================================================================
# Political Sphere — Reusable Workflow: [Name]
# ==============================================================================
#
# METADATA
# ------------------------------------------------------------------------------
# id: [workflow-id]
# version: X.Y.Z
# owner: political-sphere
# classification: internal
#
# PURPOSE
# ------------------------------------------------------------------------------
# [Single paragraph describing what the workflow does]
#
# SCOPE & RESPONSIBILITIES
# ------------------------------------------------------------------------------
# DOES:
#   - [Responsibility 1]
# DOES NOT:
#   - [Non-responsibility 1]
#
# DESIGN PRINCIPLES
# ------------------------------------------------------------------------------
# - [Principle 1]
#
# ==============================================================================
```

---

### JavaScript/TypeScript

| Totem | Path | Purpose |
| --- | --- | --- |
| **Test File** | `tools/tests/consumer-contract.test.js` | Exemplar for test files |
| **Utility Module** | `tools/tests/test-utils.js` | Exemplar for shared utilities |

**Pattern Requirements:**

```javascript
#!/usr/bin/env node

// ==============================================================================
// Political Sphere - [Module Title]
// ------------------------------------------------------------------------------
// Purpose:
//   [Single-sentence purpose statement]
// ==============================================================================

import { ... } from 'node:module';
import { ... } from './local-module.js';
```

---

### Configuration Files

| Totem | Path | Purpose |
| --- | --- | --- |
| **Contract** | `configs/consumer/contract.json` | Exemplar for versioned policy JSON |
| **ESLint Config** | `configs/lint/eslint.config.mjs` | Exemplar for lint configurations |
| **Biome Config** | `biome.json` | Exemplar for root-level config |

**JSON Pattern Requirements:**

```json
{
  "meta": {
    "version": "X.Y.Z",
    "owner": "political-sphere",
    "classification": "internal",
    "last_reviewed": "YYYY-MM-DD",
    "changelog": [...]
  },
  "policy": { ... }
}
```

---

### Policy Files

| Totem | Path | Purpose |
| --- | --- | --- |
| **Action Pinning** | `configs/ci/policies/action-pinning.yml` | Exemplar for CI policies |
| **Naming Policy** | `configs/ci/policies/naming-policy.json` | Exemplar for naming conventions |

---

## Usage Guidelines

### For AI Code Generation

When generating new files, reference the appropriate totem:

1. **Identify file type** (bash script, workflow, test, config)
2. **Locate the totem** from the registry above
3. **Copy the structure** including header, metadata, and organization
4. **Adapt content** while preserving conventions

### For Manual Review

When reviewing PRs, verify:

1. New files follow the totem pattern for their type
2. Headers include required metadata
3. Structure matches the exemplar organization
4. ShellCheck/ESLint directives follow totem patterns

### For Updating Totems

When standards evolve:

1. Update the totem file first
2. Add changelog entry (if applicable)
3. Update this document if pattern requirements change
4. Consider sweeping existing files to match new pattern

---

## Totem Health Checks

The following should be verified periodically:

- [ ] All totems still exist at documented paths
- [ ] Totems pass all lint/validation checks
- [ ] Totems reflect current best practices
- [ ] New file types have identified totems

---

## Related Documents

- [CI Policy](ci-policy.md) - Enforcement rules that totems must satisfy
- [Q&A Reference](qa-reference.md) - Governance decisions affecting patterns
- [Testing Strategy](testing-strategy.md) - Guidelines for test totems
