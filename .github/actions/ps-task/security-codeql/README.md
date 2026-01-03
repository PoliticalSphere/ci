# CodeQL Scan

Run CodeQL init, autobuild, and analyze via a canonical wrapper.

## Usage

```yaml
- name: CodeQL scan
  uses: ./.github/actions/ps-task/security-codeql
  with:
    languages: "javascript"
```

## Inputs

- `languages`: CodeQL languages (comma-separated).
- `output`: SARIF output directory. Default: `codeql-results`.
