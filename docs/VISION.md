# Political Sphere CI/CD Platform — Vision & Architectural Philosophy

> **The AI-Governed Control Plane**

This document defines the guiding principles and architectural philosophy that govern
this repository. All contributors—human and AI—must align changes with these principles.

---

## Executive Summary

This project serves as the **authoritative "Control Plane"** for the development of a
high-complexity political simulation game. Because the system is designed to allow AI
agents to move raw concepts toward perfection, the infrastructure must be **adversarially
robust**.

By decoupling the CI/CD logic from the game's source code, we create a **"Security Sandbox."**
The AI can innovate within the game's repository, but it cannot modify the Checks and
Balances that govern its own work.

---

## Core Principles

### 1. Structural Isolation (The Security Boundary)

To prevent **"Self-Governance Bias"**—where an AI might attempt to bypass security checks
or "greenlight" its own buggy code—this repository is architecturally decoupled from the
game's source code.

| Principle | Implementation |
|-----------|----------------|
| **Externalized Governance** | CI/CD logic resides in this dedicated repository, ensuring that the AI's "tools for development" are physically and logically separated from the "object of development." |
| **Immutable Gates** | By housing workflows here, we ensure that safety checks (linting, security scans, unit tests) remain immutable to AI agents working on the simulation code. |

### 2. Encapsulation and Modularization (SOLID & Clean Code)

We adhere to **SOLID principles** and **Clean Code standards** to ensure "Cognitive Ergonomics."

| Principle | Implementation |
|-----------|----------------|
| **Single Responsibility (SRP)** | Logic within custom actions must be limited to code inseparable from the action's primary utility. |
| **Decoupling** | Complex operations must be extracted into standalone, modular scripts. This ensures the AI can refine a specific simulation mechanic without touching the orchestration logic. |
| **Abstraction** | Higher-level abstractions encapsulate implementation details, providing a consistent interface that allows both humans and AI to understand *what* a component does without being bogged down by *how* it does it. |

### 3. Standardization, DRY, and Least Surprise (POLS)

Consistency is the primary tool for reducing the **"Intelligence Gap"** required to manage
the system.

| Principle | Implementation |
|-----------|----------------|
| **DRY (Don't Repeat Yourself)** | Shared logic must be extracted into a Single Source of Truth to ensure updates are propagated universally and technical debt is minimized. |
| **Principle of Least Surprise (POLS)** | The system must behave exactly as expected. We eliminate "magic" behavior in favor of predictable, explicit execution paths, ensuring that an AI agent doesn't "hallucinate" a side effect that doesn't exist. |

### 4. Minimalism: KISS and YAGNI

We apply **KISS (Keep It Simple, Stupid)** and **YAGNI (You Ain't Gonna Need It)** to
avoid over-engineering.

| Principle | Implementation |
|-----------|----------------|
| **Narrow Mastery Gap** | The gap between initial exposure to the system and sophisticated mastery should be as narrow as possible. |
| **Current Requirements Only** | We only build the abstractions required for current requirements, preventing the accumulation of speculative code that could confuse AI-driven development. |

### 5. Contextual Documentation & Cognitive Ergonomics

Documentation is **metadata for AI optimization** and human clarity.

| Level | Purpose | Location |
|-------|---------|----------|
| **Granular Context** | Standardized headers, concise subheadings, and strategic inline comments draw attention to the specific context required at the component level. | In-file headers and comments |
| **Strategic Context** | High-level intent, architectural patterns, and simulation-specific dependencies. | README files |
| **Navigation** | Central hub with deep links to specialized documentation. | This docs/ directory |

---

## CI/CD Architectural Standard

To maintain a scalable and resilient ecosystem, this project adopts a strict
**separation of interface from implementation**.

### The Caller → Reusable → Task Pattern

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW EXECUTION MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│    CALLERS              →     REUSABLES           →     TASKS                       │
│    (Event triggers)           (Orchestration)           (Execution)                 │
│                                                                                     │
│    pr-checks.yml        →     _reusable-pr-checks.yml  →  ps-bootstrap              │
│    validate-ci.yml      →     _reusable-validate-ci.yml→  ps-ci-validate            │
│    build-artifacts.yml  →     _reusable-build-artifacts→  ps-task/build             │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

| Layer | Responsibility |
|-------|----------------|
| **Callers** | Bind GitHub event triggers to reusable workflows. Manage inputs, outputs, and event context. |
| **Reusables** | Orchestrate job execution. Define job dependencies, permissions, and concurrency. Delegate to composite actions. |
| **Tasks (Actions)** | Execute atomic operations. Composite actions for shared logic. Scripts for complex operations. |

### Policy-First Execution

**Validate-CI** is the blocking gate that must pass before any other job executes.
This ensures CI policy compliance (SHA pinning, permissions, unsafe patterns) is
enforced at the earliest possible point.

```
                         ┌──────────────────┐
                         │   Validate-CI    │ ◄─── MUST PASS (blocking gate)
                         │  (policy gate)   │
                         └────────┬─────────┘
                                  │
          ┌───────────────────────┼───────────────────────────┐
          │                       │                           │
          ▼                       ▼                           ▼
 ┌────────────────┐     ┌────────────────┐         ┌────────────────┐
 │  PR Security   │     │  Quality Gates │         │ License Check  │
 └────────────────┘     └────────────────┘         └────────────────┘
```

---

## Compliance Checklist

When making changes, verify alignment with these principles:

- [ ] **Structural Isolation**: Does the change maintain the security boundary?
- [ ] **SRP**: Does each component have a single, clear responsibility?
- [ ] **DRY**: Is the logic centralized and reusable?
- [ ] **POLS**: Will the behavior surprise other contributors (human or AI)?
- [ ] **KISS/YAGNI**: Is the solution as simple as possible for current needs?
- [ ] **Documentation**: Is context provided at the appropriate granularity?

---

## Related Documentation

- [Architectural Totems](./architectural-totems.md) — Exemplar files and patterns
- [Workflow Architecture Diagrams](./workflow-architecture-diagrams.md) — Visual flow
- [CI Policy Governance](./ci-policy-governance.md) — Policy enforcement details
- [Configuration Management Guide](./configuration-management-guide.md) — Config patterns
- [Testing Strategy](./testing-strategy.md) — Test philosophy and approach

---

*This document is the authoritative source for architectural philosophy.
Changes to this vision require explicit review and documented rationale.*
