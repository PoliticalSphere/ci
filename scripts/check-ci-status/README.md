# CI Status Aggregator

Evaluates GitHub Actions job results and determines overall CI pass/fail status with proper error precedence.

## Files

- **check-ci-status.ts** - Main status aggregation script
- **check-ci-status.test.ts** - TypeScript/Vitest test suite (20 tests, 100% coverage)

## Usage

```bash
# Aggregate CI job results
./check-ci-status.ts [--debug] <secrets> <pinning> <lint> <eslint> <types> <knip> <duplication> <policy>

# Example
./check-ci-status.ts success success success success success success success success
```

### Options

- `-h`, `--help`: Show usage and exit
- `--debug`: Enable shell tracing (`set -x`). You can also set `CHECK_CI_STATUS_DEBUG=1`.

## Arguments

All 8 arguments are required and should be GitHub Actions job result strings:

1. `secrets` - Secrets detection result
2. `pinning` - Action pinning validation result
3. `lint` - Biome linter result
4. `eslint` - ESLint result
5. `types` - TypeScript type checking result
6. `knip` - Dead code detection result
7. `duplication` - Code duplication detection result
8. `policy` - Policy evaluation result

Valid values: `success`, `failure`, `cancelled`, `skipped`

## Exit Codes

- `0` - All checks passed
- `1` - Trust boundary violations or quality check failures

## Execution Model

**Error Precedence:**

1. **Trust Boundary Checks** (fail-fast violations):
   - Secrets Detection
   - Action Pinning
   - Checked first, reported with highest priority

2. **Quality Checks** (aggregate failures):
   - Biome, ESLint, TypeScript, knip, Duplication, Policy
   - Only evaluated if trust boundary checks pass

## Security Rationale

Trust boundary violations (secrets leaks, unpinned actions) represent immediate security risks and must fail CI before quality checks are evaluated. This ensures critical security issues are addressed first.

## Testing

```bash
# Run vitest tests
npm test -- scripts/check-ci-status/check-ci-status.test.ts
```

## Integration

Used in `.github/workflows/ci.yml` as the final aggregation step that determines overall CI status based on all preceding job results.
