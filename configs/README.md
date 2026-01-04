# Configs

This directory is the single source of truth for CI policy, linting rules,
and tool configuration. Consumers should reference these files directly or
copy them with minimal, well-documented changes.

Note: Biome requires a root config file, so `biome.json` lives at repo root.

## Structure

- `/configs/ci` — CI policy, allowlists, and validation rules.
  - `/configs/ci/policies` — enforcement policies, permission baselines, and approved exceptions
- `/configs/lint` — Linting, formatting, and analysis tool configs.
- `/configs/consumer` — Consumer repository contract policies.
- `/configs/security` — Security scanning configs (gitleaks, trivy, license policy).
- `/configs/policy-dependencies.yml` — Unified policy dependency registry and relationship tracking

## Unified Configuration Management

All policies and configurations are managed through a centralized **ConfigManager** system.

### Key Features

- **Single Source of Truth**: All policies discovered and managed in one place
- **Dependency Tracking**: Automatic resolution of policy relationships
- **Centralized Validation**: Unified validation logic with clear error reporting
- **Performance**: Configuration caching and lazy loading

### Getting Started

```javascript
import { ConfigManager } from '../tools/scripts/core/config-manager.js';

const manager = new ConfigManager({ repoRoot });
manager.initialize();

// Load a policy
const policy = manager.getPolicy('action-pinning');

// Validate it
const validation = manager.validateConfig('action-pinning', policy);

// Resolve its dependencies
const deps = manager.resolveDependencies('action-pinning');
```

### Learn More

See [Configuration Management Guide](../docs/configuration-management-guide.md) for:
- Detailed API reference
- Policy categories and relationships
- Integration patterns with CI, lint, and security workflows
- Registering new policies

### Policy Dependencies

Policy relationships are defined in `policy-dependencies.yml`:
- Which policies depend on other policies
- Which validators check each policy
- Which systems consume each policy
- Risk levels and categorization

See the file for complete dependency graph and logical groupings.

## Usage

- Prefer referencing these files from workflows and scripts.
- If customization is required, document the delta and rationale.
- Use ConfigManager for programmatic access instead of direct file loading
