# Setup Node.js Environment

Composite GitHub Action that sets up a complete Node.js development environment for CI jobs.

## What it does

1. **Checkout** - Clones the repository with configurable history depth
2. **Setup Node.js** - Installs Node.js with npm caching enabled
3. **Install Dependencies** - Runs `npm ci` for deterministic installs

## Usage

### Basic usage (shallow clone)

```yaml
steps:
  - name: Setup Node.js environment
    uses: ./.github/actions/setup-node-env

  - name: Run tests
    run: npm test
```

### With full git history

```yaml
steps:
  - name: Setup Node.js environment
    uses: ./.github/actions/setup-node-env
    with:
      fetch-depth: 0  # Full history for all branches and tags
```

### With custom Node.js version

```yaml
steps:
  - name: Setup Node.js environment
    uses: ./.github/actions/setup-node-env
    with:
      node-version: '20'
```

## Inputs

| Input          | Description                                     | Required | Default |
| :------------- | :---------------------------------------------- | :------: | :-----: |
| `fetch-depth`  | Number of commits to fetch. `0` = full history  |   No     |  `1`    |
| `node-version` | Node.js version to install                      |   No     |  `22`   |

## Benefits

- **Single source of truth** for Node.js setup across all CI jobs
- **Consistent environment** - same versions and caching strategy
- **Reduced duplication** - replaces 15+ lines with 2 lines per job
- **Easy updates** - change Node.js version in one place
- **Maintainable** - clear separation of concerns

## Security

All third-party actions are pinned to full commit SHAs:

- `actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8` (v6.0.1)
- `actions/setup-node@395ad3262231945c25e8478fd5baf05154b1d79f` (v6.1.0)

## Used By

This composite action is used by the following workflow jobs:

- `lint-format` - Biome linting
- `lint-eslint` - ESLint static analysis
- `typecheck` - TypeScript type checking
- `dead-code` - knip dead code detection
- `duplication` - jscpd duplication detection
- `policy` - Policy evaluation (with `fetch-depth: 0`)
