# Task Scripts

Deterministic build and verification tasks used by local gates and CI jobs.

## Contents

- `build.sh`: run the project build (requires scripts.build in CI).
- `test.sh`: run deterministic tests under `tools/tests`.
- `typecheck.sh`: strict TypeScript checks.
- `jscpd.sh`: duplication detection via JSCPD.

## Usage

- `bash tools/scripts/tasks/build.sh`
- `bash tools/scripts/tasks/test.sh`
- `bash tools/scripts/tasks/typecheck.sh`
- `bash tools/scripts/tasks/jscpd.sh`
