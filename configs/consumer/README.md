# Consumer Contract Configs

Policy files that define how consumer repositories are validated for common
AI and human misconfigurations.

## Files

- `contract.json`: required files, scripts, tools, and workflow usage rules.
- `exceptions.json`: approved exceptions with explicit risk decisions.

The contract checker supports JSON by default. YAML is supported if the
`yaml` package is available in the runtime.

## Exception entries

Each exception entry must be an object with:

- `value`: the item being exempted (file, script, tool, workflow, import).
- `reason`: short rationale for the exception.
- `risk_decision`: reference to `docs/risk-decisions.md` (URL or anchor).

Example:

```json
{
  "value": "jest",
  "reason": "Legacy service still uses Jest during migration window",
  "risk_decision": "docs/risk-decisions.md#rd-2025-12-20-jest"
}
```

## Usage

Consumer repositories reference the contract policy via the
`consumer-contract.yml` reusable workflow and can override paths as needed.
