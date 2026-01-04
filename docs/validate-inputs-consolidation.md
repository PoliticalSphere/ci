# Validate-Inputs Consolidation Summary

## Overview
Consolidated common validation patterns from five `validate-inputs.sh` scripts into a reusable shared library, reducing code duplication and improving maintainability.

## Changes Made

### 1. New Shared Library
**File**: [tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh](tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh)

A centralized validation helper library providing:
- **Boolean validation**: `validate_bool()` - Normalizes 0/1/true/false to canonical forms
- **Enum validation**: `validate_enum()` - Validates against allowed values  
- **Numeric validation**: `validate_int_nonneg()` - Non-negative integer validation
- **Path validation**: `validate_repo_path()` - Repo-relative path safety checks
- **Working directory validation**: `validate_working_directory()` - Safe working directory handling
- **Package manager validation**: `validate_package_lock_required()` - Checks package.json/lock.json
- **Fetch depth validation**: `validate_fetch_depth_with_full_history()` - Ensures consistency
- **Repository validation**: `validate_owner_repo()` - OWNER/REPO format validation
- **Environment export helper**: `emit_validated_env()` - Consistent env var emission

### 2. Updated Validate-Inputs Scripts
All five action validation scripts now source the shared library:

1. **ps-initialize-environment**: [validate-inputs.sh](tools/scripts/actions/ps-bootstrap/ps-initialize-environment/validate-inputs.sh)
2. **ps-node**: [validate-inputs.sh](tools/scripts/actions/ps-bootstrap/ps-node/validate-inputs.sh)
3. **ps-checkout-platform**: [validate-inputs.sh](tools/scripts/actions/ps-bootstrap/ps-checkout-platform/validate-inputs.sh)
4. **ps-harden-runner**: [validate-inputs.sh](tools/scripts/actions/ps-bootstrap/ps-harden-runner/validate-inputs.sh)
5. **ps-tools**: [validate-inputs.sh](tools/scripts/actions/ps-bootstrap/ps-tools/validate-inputs.sh)

## Benefits

- **DRY Principle**: Common validation logic centralized in one place
- **Consistency**: All bootstrap actions use the same validation patterns
- **Maintainability**: Single source of truth for validation logic
- **Extensibility**: Easy to add new validation helpers
- **Testing**: Shared functions can be unit tested once

## Backward Compatibility

✅ **No breaking changes** - All existing validation behavior preserved. Scripts continue to work identically; only internal structure changed.

## Usage Example

```bash
#!/usr/bin/env bash
source "${GITHUB_WORKSPACE}/tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh"

# Validate boolean input
my_bool=$(validate_bool "inputs.my_flag" "${INPUT_MY_FLAG:-false}")

# Validate working directory
wd=$(validate_working_directory "${INPUT_WORKING_DIR:-}")

# Validate enum
bundle=$(validate_enum "inputs.bundle" "${INPUT_BUNDLE}" "lint" "security" "none")

# Export validated value
emit_validated_env "MY_VALIDATED_VAR" "${my_bool}"
```

## Testing

All scripts pass bash syntax validation:
- ✓ ps-initialize-environment/validate-inputs.sh
- ✓ ps-node/validate-inputs.sh  
- ✓ ps-checkout-platform/validate-inputs.sh
- ✓ ps-harden-runner/validate-inputs.sh
- ✓ ps-tools/validate-inputs.sh
- ✓ shared/validate-inputs-common.sh

## Related Documentation

- [PS Bootstrap Architecture](../../docs/ci-policy-governance.md)
- [Configuration Management Guide](../../docs/configuration-management-guide.md)
