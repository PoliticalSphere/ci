# Action Pinning Validator

Validates that all GitHub Actions in workflow files are pinned to full 40-character commit SHAs.

## Files

- **validate-action-pinning.ts** - Main validation script
- **validate-action-pinning.test.ts** - TypeScript/Vitest test suite (13 tests, 100% coverage)

## Usage

```bash
# Validate default .github/workflows directory
./validate-action-pinning.ts

# Auto-fix unpinned actions (resolves to latest commit SHA)
./validate-action-pinning.ts --fix

# Validate custom directory
./validate-action-pinning.ts path/to/workflows

# Show help
./validate-action-pinning.ts --help
```

## Options

- `--fix` - Automatically fix unpinned actions by resolving tags/branches to latest commit SHAs
- `-h, --help` - Display usage information

## Exit Codes

- `0` - All actions properly pinned (or fixed with --fix), or no actions found
- `1` - Unpinned actions detected or directory not found

## Features

- **Strict SHA Validation**: Ensures SHAs are valid 40-character hex strings
- **Comment Filtering**: Ignores `uses:` in YAML comments to prevent false positives
- **Local Action Support**: Skips validation for local actions (`./` or `../` paths)
- **Auto-Fix**: Optionally resolves unpinned actions to latest commit SHAs via GitHub API

## Security Rationale

SHA pinning prevents supply chain attacks by ensuring GitHub Actions cannot be silently updated to malicious versions via tag manipulation. All actions must use full 40-character commit SHAs (e.g., `@8e8c483db84b4bee98b60c0593521ed34d9990e8`) rather than mutable tags (e.g., `@v4`).

Local actions (e.g., `./.github/actions/my-action`) are exempt from SHA pinning since they're version-controlled within the repository.

## Testing

```bash
# Run vitest tests
npm test -- scripts/validate-action-pinning/validate-action-pinning.test.ts
```

## Integration

Used in `.github/workflows/ci.yml` as a trust boundary check (fail-fast on violations).
