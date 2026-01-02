# Gate Scripts

Local developer gates and shared helpers used by Lefthook and CI entrypoints.

## Contents

- `gate-common.sh`: shared helpers for gate steps and output.
- `gate-pre-commit.sh`: fast pre-commit validation gate.
- `gate-pre-push.sh`: heavier pre-push validation gate.

Gate output emits structured `PS.LOG` records in addition to human-readable
sections (see `docs/terminal-output-standard.md`).

## Usage

- `bash tools/scripts/gates/gate-pre-commit.sh`
- `bash tools/scripts/gates/gate-pre-push.sh`
