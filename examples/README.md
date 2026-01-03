# Examples

This directory contains example consumer configurations that show how to
integrate the Political Sphere CI/CD platform.

## Contents

- `consumer-workflow.yml` — Example workflow that calls `pr-gates.yml`

## Usage

Copy `consumer-workflow.yml` to your repository's `.github/workflows/` directory
and customize as needed:

1. Update the version tag (`@v1.0.0`) to your desired platform version
2. Adjust permissions based on your needs
3. Pass the required PR context inputs

## Required Inputs

| Input | Description |
|-------|-------------|
| `pr_number` | Pull request number |
| `pr_is_fork` | Whether the PR is from a fork |
| `pr_base_ref` | Base commit SHA |
| `pr_head_ref` | Head commit SHA |

## Optional Inputs

| Input | Description | Default |
|-------|-------------|--------|
| `runner` | Runner label | `ubuntu-22.04` |
| `node_version` | Node.js version | `22` |
| `allow_pr_comments` | Post results as PR comment | `false` |
| `ps_full_scan` | Run full scan (vs affected-only) | `false` |

See the [Integration Guide](../docs/integration-guide.md) for complete documentation.
