#!/usr/bin/env bash
# ==============================================================================
# Political Sphere — Naming Conventions Reference
# ==============================================================================
# Quick lookup guide for semantic naming in tools/scripts/
# ==============================================================================

# This is a reference document showing correct naming patterns.
# Not intended to be sourced.

# ==============================================================================
# File Naming Patterns
# ==============================================================================

# ✅ CORRECT: Semantic names reflecting architectural layer

tools/scripts/core/runner-base.sh        # Abstraction: "base"
tools/scripts/core/security-runner-base.sh # Abstraction: "base"
tools/scripts/core/action-input-validator.sh # Abstraction: "validator"
tools/scripts/core/validation.sh          # Infrastructure: core concern
tools/scripts/core/path-resolution.sh     # Infrastructure: core concern
tools/scripts/core/logging.sh             # Infrastructure: core concern
tools/scripts/core/gha-helpers.sh         # Infrastructure: primitives only
tools/scripts/core/time-helpers.sh        # Infrastructure: primitives only

tools/scripts/runners/lint/biome.sh       # Runner: <type>/<subcategory>/<tool>
tools/scripts/runners/lint/eslint.sh      # Runner: <type>/<subcategory>/<tool>
tools/scripts/runners/security/gitleaks-history.sh # Runner

tools/scripts/actions/ps-bootstrap/action.yml     # Action definition
tools/scripts/actions/ps-bootstrap/index.sh       # Action implementation
tools/scripts/actions/ps-bootstrap/shared/validate-inputs-common.sh # Action-specific

tools/scripts/gates/pre-commit.sh         # Gate: <hook-type>
tools/scripts/gates/pre-push.sh           # Gate: <hook-type>


# ❌ WRONG: Generic or ambiguous names

tools/scripts/core/helpers.sh             # Too generic - which domain?
tools/scripts/core/common.sh              # Reserved for facades only
tools/scripts/runners/lint/utils.sh       # Too generic - what utilities?
tools/scripts/runners/lint/lint-helpers.sh # Redundant naming
tools/scripts/actions/validate.sh         # Not semantic - belongs in core/


# ==============================================================================
# Function Naming Patterns
# ==============================================================================

# ✅ CORRECT: Semantic function names following scope_verb_noun pattern

# Layer 1: Infrastructure (no scope prefix for primitives)
require_bool                              # Validate boolean
require_enum                              # Validate enum value
require_positive_number                   # Validate positive integer
require_int_nonneg                        # Validate non-negative integer
require_owner_repo                        # Validate "OWNER/REPO" format
safe_relpath                              # Safely normalize relative path
safe_relpath_no_dotdot                    # Safely validate path (forbid "..")
normalize_path                            # Normalize path representation
git_find_repo_root                        # Find repository root
gha_set_output                            # Set GitHub Actions output

# Layer 2: Abstractions (scope prefix required)
runner_init                               # Initialize runner framework
runner_require_config                     # Require runner configuration
runner_require_tool                       # Require tool availability
runner_collect_targets                    # Collect targets for runner
runner_skip_if_no_targets                 # Early exit if no targets
runner_exec                               # Execute with runner framework
security_runner_init                      # Initialize security runner
security_set_baseline                     # Set security baseline
security_set_report                       # Set security report path
security_exec                             # Execute security scan
security_exec_pr_mode                     # Execute in PR scan mode
action_validate_bool                      # Validate action boolean input
action_validate_enum                      # Validate action enum input
action_validate_path                      # Validate action path input

# Layer 3: Runners (tool-specific, no scope prefix)
run_biome                                 # Run biome linter (internal)
run_eslint                                # Run eslint linter (internal)

# Layer 5: Orchestration (gate or workflow prefix)
gate_pre_commit                           # Run pre-commit gate (internal)


# ❌ WRONG: Inconsistent or ambiguous function names

run_tool                                  # Which tool? Ambiguous
tool_validate                             # Validate what? Ambiguous
do_check                                  # What check? Too generic
lint_run_eslint                           # Don't duplicate module name
_private_helper                           # Private functions: "name" not "_name"
validate_inputs_common                    # Not semantic, no scope
helper_function                           # Not semantic, no pattern


# ==============================================================================
# Variable Naming Patterns (exported variables)
# ==============================================================================

# ✅ CORRECT: Scope-prefixed state variables for abstractions

RUNNER_ID                                 # Runner identifier
RUNNER_MODE                               # Runner execution mode (staged/pr/full)
RUNNER_CONFIG                             # Path to runner configuration
RUNNER_TOOL_BIN                           # Path to tool binary
RUNNER_TARGETS                            # Array of targets to process
RUNNER_STATUS                             # Execution status code

SECURITY_BASELINE_PATH                    # Path to security baseline/allowlist
SECURITY_REPORT_PATH                      # Path to security report
SECURITY_SCAN_MODE                        # Scan mode (history/pr/working-tree)

PS_FULL_SCAN                              # Platform-wide: full scan flag
PS_REPO_ROOT                              # Platform-wide: repository root
GITHUB_WORKSPACE                          # GitHub Actions: workspace

# ❌ WRONG: Global state pollution or inconsistent prefixes

TARGETS                                   # Too generic - which module?
CONFIG                                    # Too generic - which module?
result                                    # Lowercase - should be uppercase
LINT_RESULTS                              # Module-specific state (anti-pattern)
tool_output                               # Lowercase exported state


# ==============================================================================
# File Organization Patterns
# ==============================================================================

# ✅ CORRECT: Clear concern boundaries

tools/scripts/
├── core/
│   ├── bootstrap.sh                       # Single entry point
│   ├── validation.sh                      # ALL validation logic
│   ├── path-resolution.sh                 # ALL path handling
│   ├── gha-helpers.sh                     # GitHub Actions primitives
│   ├── runner-base.sh                     # Runner abstraction
│   └── branding/
│       └── format.sh                      # Output formatting
├── runners/
│   ├── lint/
│   │   ├── biome.sh                       # Single tool
│   │   ├── eslint.sh                      # Single tool
│   │   └── common.sh                      # Facade (temporary)
│   └── security/
│       ├── gitleaks-history.sh            # Single tool
│       └── secret-scan-pr.sh              # Single tool
└── actions/
    └── ps-bootstrap/
        ├── action.yml                     # Action definition
        ├── index.sh                       # Orchestration
        └── shared/
            └── validate-inputs-common.sh  # Action-specific only

# ❌ WRONG: Mixed concerns or poor organization

tools/scripts/
├── runners/
│   ├── lint/
│   │   ├── biome.sh
│   │   ├── eslint.sh
│   │   ├── helpers.sh                     # ❌ Which module?
│   │   ├── validation.sh                  # ❌ Duplicate! Use core/validation.sh
│   │   ├── common.sh                      # ❌ OK only if facade
│   │   └── formatted-output-helpers.sh    # ❌ Should be in core/branding/
│   └── helpers/
│       ├── helpers.sh                     # ❌ Nested helpers
│       └── common.sh                      # ❌ Nested common


# ==============================================================================
# Scope Prefixes (Required in abstractions, forbidden in primitives)
# ==============================================================================

# For ABSTRACTIONS (Layer 2):
# Prefix function/variable with abstraction scope

runner_*            # runner-base.sh functions
security_*          # security-runner-base.sh functions
action_*            # action-input-validator.sh functions

# For INFRASTRUCTURE (Layer 1):
# No scope prefix - these are primitives

require_bool        # Not "validation_require_bool"
safe_relpath        # Not "path_safe_relpath"
git_find_repo_root  # Not "path_git_find_repo_root"

# For RUNNERS (Layer 3):
# No scope prefix for concrete runners - they use abstractions

# For GATES/WORKFLOWS (Layer 5):
# Optional prefix; use if multiple gate types

gate_pre_commit     # Optional
pre_commit          # Also OK


# ==============================================================================
# Anti-Patterns to Avoid
# ==============================================================================

❌ Avoid these naming patterns:

# ❌ Generic "common" anywhere except facades
tools/scripts/core/common.sh               # NO - consolidate to specific module
tools/scripts/runners/common.sh            # NO - consolidate or move
tools/scripts/actions/common.sh            # NO - move to core/

# ❌ "helpers" for anything except primitives
tools/scripts/core/lint-helpers.sh         # NO - should be in branding/
tools/scripts/runners/lint/helpers.sh      # NO - use runner-base
tools/scripts/runners/validation-helpers.sh # NO - use core/validation.sh

# ❌ Duplicate module concerns
tools/scripts/core/validation.sh
tools/scripts/core/validators.sh           # NO - consolidate!
tools/scripts/runners/validation.sh        # NO - use core/validation.sh

# ❌ Tool-specific logic in "common"
tools/scripts/runners/lint/common.sh
  # contains: eslint-specific config loading
  # should be: in eslint.sh using runner-base

# ❌ Action-specific concerns outside core/
tools/scripts/actions/validate-inputs.sh   # NO - use core/action-input-validator.sh
tools/scripts/actions/input-helpers.sh     # NO - consolidate to core/


# ==============================================================================
# How to Name New Files
# ==============================================================================

# Q: I'm creating a new X. What should I name it?

# Q: New configuration validator
# A: Add function to core/validation.sh (or action-input-validator.sh if action-specific)

# Q: New output formatter
# A: Add function to core/branding/format.sh

# Q: New tool runner
# A: runners/<type>/<tool-name>.sh using runner-base.sh

# Q: New security scanner
# A: runners/security/<tool-name>.sh using security-runner-base.sh

# Q: New GitHub Actions helper
# A: Add function to core/gha-helpers.sh

# Q: New git utility
# A: Add function to core/path-resolution.sh

# Q: New abstraction pattern
# A: core/<abstraction-name>-base.sh (e.g., runner-base.sh)

# Q: New action
# A: actions/<action-name>/action.yml + actions/<action-name>/index.sh

# Q: New pre-commit/pre-push gate
# A: gates/<hook-type>.sh


# ==============================================================================
# Enforcement
# ==============================================================================

# Run these checks to verify naming conventions:

# Find new "common.sh" files (should not exist)
find tools/scripts -name "*common.sh" \
  -not -path "*runners/lint/common.sh" \
  -not -path "*gates/common.sh"

# Find "helpers.sh" files in wrong locations
find tools/scripts -name "*helpers.sh" \
  -not -path "*core/*" \
  -not -name "gha-helpers.sh" \
  -not -name "time-helpers.sh"

# Find validation files outside core/
find tools/scripts -name "*validation*.sh" \
  -not -path "*core/*" \
  -not -path "*actions/ps-bootstrap/shared/*"

# ==============================================================================
# Version
# ==============================================================================

# Last Updated: 2024
# Maintained By: Political Sphere
# Review Cycle: Quarterly
