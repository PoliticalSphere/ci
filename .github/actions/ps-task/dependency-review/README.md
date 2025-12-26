# Dependency Review

Run GitHub dependency review via a canonical task wrapper.

## Usage

```yaml
- name: Dependency review
  uses: ./.github/actions/ps-task/dependency-review
  with:
    base_ref: ${{ inputs.pr_base_ref }}
    head_ref: ${{ inputs.pr_head_ref }}
```

## Inputs

- `base_ref`: Base ref (SHA).
- `head_ref`: Head ref (SHA).
