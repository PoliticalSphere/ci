# Political Sphere — CI/CD & Governance Platform

| Field           | Value                                              |
| --------------- | -------------------------------------------------- |
| **Version**     | 0.0.1                                              |
| **Created**     | 2026-01-07                                         |
| **Last edited** | 2026-01-07                                         |
| **Created by**  | GitHub Copilot (GPT-5.1-Codex-Max)                 |
| **Updated by**  | GitHub Copilot (GPT-5.1-Codex-Max)                 |
| **Purpose**     | CI/CD and governance platform for Political Sphere |

---

## Overview

- Policy Engine: see src/policy/README.md for risk classification, attestation validation, and decision APIs with examples.

## Node Version Support

- **Required:** Node 22.21.1 or higher
- **Recommended:** Node 22.x (Active LTS)
- **Tested:** Node 22.21.1

This repository is the **authoritative CI/CD and governance platform** for the Political Sphere project. It defines, owns, and enforces the automated pipelines, tooling, and execution logic that determine whether changes to the platform are trusted, validated, and permitted to integrate.

All Political Sphere repositories consume this platform. CI behaviour, quality standards, security controls, and governance rules are **centrally defined, versioned, and enforced** here. Downstream repositories inherit these rules unchanged and do not re-implement or locally override CI logic without an explicit change to this repository.

This repository also implements **policy-as-code governance**, including controls governing AI-assisted development. AI usage is treated as a **first-class and expected mode of development**, not an exception. Governance applies uniformly to all changes, regardless of whether they are authored by humans, AI systems, or a combination of both.

This repository **does not** contain application logic, runtime infrastructure, deployment environments, or AI models. Its sole responsibility is to define **how change is validated and trusted**, not what the Political Sphere applications do at runtime.

By centralising CI/CD, DevOps automation, and governance in a single platform repository, Political Sphere:

- eliminates configuration drift,
- prevents silent weakening of standards,
- enables consistent enforcement across repositories, and
- supports controlled, auditable evolution of development practices.

---

## Guiding Principles

The design, implementation, and evolution of this platform are governed by the following principles. These principles are **normative**: they are not aspirational guidelines, but constraints on how the system is built and changed.

---

### Software & Platform Engineering

- **Single source of truth** — CI behaviour and governance rules are defined in one authoritative location.
- **Determinism over convenience** — identical inputs must produce identical outcomes across environments.
- **Explicit contracts** — downstream repositories consume behaviour via defined interfaces; logic is not copied.
- **Fail closed** — ambiguous, invalid, or incomplete states result in failure rather than permissive execution.
- **Auditability by design** — decisions must be explainable, inspectable, and reproducible after the fact.
- **Separation of concerns** — orchestration, execution, and policy evaluation are distinct responsibilities.
- **Composability over monoliths** — components should be reusable and independently testable.
- **Minimal surface area** — expose only what is necessary for correct consumption.
- **Predictable change** — platform evolution must be deliberate, versioned, and controlled.

---

### Maintainability & Code Quality

- **DRY (Don’t Repeat Yourself)** — shared logic exists once, centrally; duplication is treated as technical debt.
- **KISS (Keep It Simple)** — prefer the simplest solution that satisfies enforcement and safety requirements.
- **SOLID where applicable** — abstractions should have clear responsibilities and stable interfaces.
- **Ease of maintenance over cleverness** — readable, boring code is preferred to novel or opaque solutions.
- **Avoid over-engineering** — features are introduced only when there is a clear, current need.
- **Progressive complexity** — complexity is earned, not pre-emptively designed.
- **Refactorability** — the system must be safe to change without cascading breakage.
- **Tooling as infrastructure** — tooling decisions are treated as long-lived platform commitments.

---

### DevOps & CI/CD

- **CI is authoritative** — local execution is advisory and cannot override CI outcomes.
- **Least privilege** — workflows and jobs run with the minimum permissions required.
- **Defense in depth** — multiple independent controls protect critical trust boundaries.
- **Fast feedback, strict gates** — provide rapid signals without compromising enforcement.
- **No implicit trust** — external inputs, tools, and actions are assumed untrusted unless verified.
- **Immutable consumption** — downstream repositories pin exact versions or commit SHAs.
- **Observable execution** — failures must be diagnosable through logs and structured outputs.
- **Automation over process** — rules are enforced by code, not by convention or memory.

---

### Governance & Risk Management

- **Policy-as-code** — governance rules are expressed, versioned, and enforced in code.
- **Uniform enforcement** — the same rules apply to all changes, regardless of origin.
- **Risk-proportionate controls** — higher-impact changes trigger stricter enforcement.
- **Explicit escalation** — elevated risk is surfaced clearly, not silently tolerated.
- **No bypass paths** — enforcement mechanisms cannot be selectively disabled.
- **Human accountability** — responsibility for changes always remains with a human decision-maker.
- **Controlled blast radius** — changes affecting multiple repositories are introduced deliberately.

---

### AI-Assisted Development

- **AI is assumed, not exceptional** — governance does not rely on detecting AI usage.
- **Disclosure over detection** — explicit attestation is preferred to heuristic inference.
- **No implicit trust in generated output** — AI output is validated like any other input.
- **Policy-as-code enforcement** — AI controls are enforced through CI, not convention.
- **Human-in-the-loop by design** — AI may assist, but does not autonomously approve changes.
- **Traceability of influence** — AI-assisted changes must remain attributable and reviewable.
- **Tool neutrality** — governance applies regardless of which AI tool is used.

---

### Meta-Principle

> **If a rule matters, it must be enforceable.  
> If it cannot be enforced, it does not belong in this platform.**

---

## Scope and Responsibilities

### Scope and Responsibilities

This repository is responsible for:

- Defining and maintaining all CI/CD workflows executed across Political Sphere repositories
- Providing shared linting, formatting, type-checking, and quality-gate infrastructure
- Enforcing security, compliance, and governance rules as CI gates
- Defining policy-as-code controls, including AI governance
- Establishing authoritative execution order, failure semantics, and approval requirements

### Out of scope

This repository is **not** responsible for:

- Application-specific build or deployment logic
- Runtime infrastructure or production operations
- Secrets generation or long-term secret storage
- Application-level AI models, prompts, or inference logic
- Editor-only or non-enforced developer tooling

---

## Consumption Model

Downstream repositories consume this platform through **explicit, versioned entry points**.

- CI logic is **referenced**, never copied.
- Consumption uses pinned commit SHAs (or releases as aliases).
- Behaviour is inherited unchanged.

Local execution is supported to provide developer feedback and parity with CI. However:

> **CI execution defined by this repository is authoritative.**  
> Local execution cannot weaken, bypass, or redefine enforcement.

Downstream repositories must treat this platform as an **external contract**, not an internal utility.

## Architecture Overview

The platform is structured as a **layered system with unidirectional control flow**:

1. **Entry-point workflows**  
   Reusable GitHub Actions workflows that define when and how CI runs.

2. **Execution & orchestration layer**  
   TypeScript-based orchestration responsible for sequencing, policy decisions, and outputs.

3. **Policy-as-code controls**  
   Declarative and procedural rules that determine whether changes are allowed, denied, or escalated.

Control flows **downward only**. No layer bypasses the layers beneath it.

## Execution Model

The platform executes a deterministic sequence of validation and enforcement steps in response to repository events.

Execution varies by **context**:

- CI vs local execution
- Full scans vs affected-change execution

Enforcement semantics do not vary:

- CI failures are authoritative.
- Informational checks are explicitly marked.
- Required checks must pass before progression.

This model prioritises correctness, predictability, and auditability over speed alone.

## Error Handling Strategy

The codebase uses a **shared error hierarchy** to keep error behavior consistent across modules:

- **Typed errors with codes**: Errors inherit from `AppError` and carry a stable `code` for programmatic handling.
- **Domain-specific subclasses**: CLI input, process execution, binary checks, and execution locks use dedicated error types.
- **Formatted messages at boundaries**: User-facing logs call `formatErrorMessage` to include the error code when available.
- **Deterministic outcomes**: Execution results record errors as normalized messages without leaking stack traces.

This keeps errors predictable across CLI, execution modules, and policy surfaces.

## Governance and Enforcement Model

This repository defines the **governance model** under which all changes to the Political Sphere platform are validated and approved.

Governance applies uniformly to all changes:

- human-authored,
- AI-authored,
- or collaboratively produced.

AI-assisted development is pervasive and governed through **standard CI enforcement**, not special-case processes. Where AI introduces elevated risk (e.g. changes to trust boundaries or governance logic), stricter controls apply automatically.

Governance controls are implemented as **policy-as-code**, aligned with:

- least privilege,
- defense in depth,
- explicit approval for high-risk change,
- full traceability of decisions.

This repository enforces **how trust is established**, not who authored the change.

---

## Parallel Linting CLI

This repository includes a **world-class parallel linter CLI** designed for maximum speed and auditability:

- ⚡ **Parallel Execution**: Runs all linters concurrently using N-1 CPU cores
- 🎨 **Real-Time Dashboard**: Zero-flicker terminal UI with live status updates
- 🔗 **Clickable Logs**: OSC 8 hyperlinks for instant log access
- 📝 **Dual Logging Modes**:
  - Standard mode with timestamps and linter IDs
  - Verification mode for raw byte-for-byte audit compliance
- ⏱️ **Automatic Timeouts**: Graceful handling of stuck processes
- 🛡️ **Robust Error Detection**: Binary checks, timeout handling, exit code validation

### Quick Start

```bash
# Run core linters (gitleaks, biome, eslint, typescript, knip)
npm run lint

# Run ALL linters including markdown, spelling, and duplication checks
npm run lint:all

# Run with verification mode for audit logs
npm run lint -- --verify-logs

# Run specific linters only
npm run lint:all -- --linters gitleaks,biome,eslint
```

See [PARALLEL_LINTER.md](PARALLEL_LINTER.md) for complete documentation.

### Binary Dependencies

Some linters require system binaries to be installed separately. The platform automatically checks for their availability and will skip or report errors for missing dependencies.

**Required for full linting:**

- **Gitleaks** (v8.30.0+): Secret detection

  ```bash
  # macOS
  brew install gitleaks
  
  # Linux
  # https://github.com/gitleaks/gitleaks/releases
  ```

- **OSV-Scanner**: Vulnerability scanning for dependencies

  ```bash
  # macOS
  brew install osv-scanner
  
  # Linux
  # https://github.com/google/osv-scanner/releases
  ```

- **Semgrep**: Static analysis for security

  ```bash
  # macOS
  brew install semgrep
  
  # Linux/pip
  pip install semgrep
  ```

- **ShellCheck**: Shell script analysis

  ```bash
  # macOS
  brew install shellcheck
  
  # Linux (apt)
  sudo apt-get install shellcheck
  ```

- **Hadolint**: Dockerfile linting

  ```bash
  # macOS
  brew install hadolint
  
  # Linux
  # https://github.com/hadolint/hadolint/releases
  ```

All other linters are installed as npm dev dependencies.

---

## Versioning and Change Control

All CI/CD behaviour and governance logic is **explicitly versioned**.

- Downstream repositories opt into changes by updating their pinned reference.
- No changes take effect implicitly or retroactively.
- Breaking changes are deliberate and documented.

Changes to CI behaviour, governance rules, enforcement thresholds, or AI controls require review and approval through this repository’s change process.

---

## Closing Principle

> **This repository defines how change is trusted.**  
> Code, configuration, and AI-assisted output become part of Political Sphere only by passing the standards enforced here.
