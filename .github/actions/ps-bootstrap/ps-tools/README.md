# PS Tools

Install pinned CLI tools using a deterministic installer with validated inputs
and a stable output contract.

## Usage

```yaml
- name: Install tools
  uses: ./.github/actions/ps-bootstrap/ps-tools
  with:
    bundle: lint
    run_security_scans: "0"
```

## Inputs

- `install_dir`: Repo-relative directory for tools. Default: `.tooling/bin`.
- `bundle`: Predefined tools bundle (`lint`|`security`|`none`). Default: `none`.
- `extra_tools`: Optional newline-separated list of extra tool ids. Default: empty.
- `tools`: Optional explicit newline-separated tool list. Takes precedence over
  `bundle` and `extra_tools`. Default: empty.
- `run_security_scans`: Run fast security scans after install (`0`|`1`).
  Default: `0`.

## Outputs

- `resolved_tools`: Final newline-separated tool ids selected for install.
- `install_dir_abs`: Absolute path to the install directory.

## Notes

- Tool selection precedence is: `tools` > `bundle` + `extra_tools`.
- `install_dir` must be repo-relative and must not contain `..` or be absolute.
