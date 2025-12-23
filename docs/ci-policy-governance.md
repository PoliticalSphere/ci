% CI Policy Governance

## Purpose

This document centralizes the operational guidance for updating the Validate-CI
policy bits (`configs/ci/policies/validate-ci.yml` and its companion
allowlists/baselines). When a change touches multiple rules, consult the
relevant section here instead of repeating the rationale inside each rule
block.

## When to update each allowlist/baseline

- **`configs/ci/policies/allowed-actions.yml`**  
  Whenever a new third-party action is required by the platform, add it to the
  allowlist and capture the risk in `docs/risk-decisions.md`. Documenting the
  reason there satisfies `rule_defaults`’s
  `require_risk_decision_for_exceptions` flow.

- **`configs/ci/policies/permissions-baseline.yml`**  
  Update if you need to allow additional workflow/job defaults (e.g., new
  runners requiring read-only `contents`), and document the scope in
  `docs/risk-decisions.md`. Keep the baseline as narrow as possible—use
  inline justifications per workflow when deviating.

- **`configs/ci/policies/unsafe-patterns.yml`**  
  Add new patterns when you discover unsafe scripting idioms. Each entry
  should include a human-readable description and, if needed, an allowlist
  entry under `configs/ci/policies/unsafe-patterns-allowlist.yml`.

- **`configs/ci/policies/artifact-policy.yml`**  
  Extend `required_paths` only when a new artifact directory is mandatory
  for downstream jobs; keep the list minimal to reduce audit noise.

## Rule grouping

- **Supply-chain guardrails (`sha_pinning`, `remote_sha_verify`, `local_actions`)**
  share enforcement defaults and are grouped under `rule_groups.supply_chain`
  for centralized review of action trust decisions.
- **Scripting guardrails (`inline_bash`, `unsafe_patterns`, `secrets_handling`)**
  share enforcement defaults and are grouped under `rule_groups.scripting` so
  you can reason about shell/script safety holistically.
- **Artifact-related enforcement (`outputs_and_artifacts`)** uses the shared
  defaults as well and is grouped under `rule_groups.artifacts` for easy
  reference.

## Updating enforcement defaults

If you ever need a new default (e.g., a rule that should be `mode: advisory`),
add a new shared anchor near the top of
`configs/ci/policies/validate-ci.yml` and document the rationale here. Always
keep `rule_defaults` consistent with the idea that everything is
enforce-by-default unless explicitly noted.

## Referencing this governance doc

Every rule that touches allowlists, baselines, or similar
cross-cutting concerns should point back to this doc via the
`meta.governance_doc` field defined in `validate-ci.yml`. That way
downstream tooling or reviewers know exactly where to read the policy
rationales.
