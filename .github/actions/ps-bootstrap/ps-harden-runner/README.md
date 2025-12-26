# PS Harden Runner

Harden the GitHub runner using a SHA-pinned `step-security/harden-runner`
dependency with validated inputs.

## Usage

```yaml
- name: Harden runner
  uses: ./.github/actions/ps-bootstrap/ps-harden-runner
  with:
    egress_policy: audit
```

## Inputs

- `egress_policy`: Egress policy for `step-security/harden-runner`
  (`audit`|`block`). Default: `audit`.
- `home_dir`: HOME directory to use for the harden step. Default:
  `${{ runner.temp }}`.
