# GitHub Automation

This directory contains the **GitHub Actions automation layer** for the
Political Sphere CI/CD platform: reusable workflows, composite actions, and
automation governance files.

---

## Structure

- `/.github/workflows` reusable workflows via `workflow_call`
- `/.github/actions` composite actions for shared logic
- `/.github/dependabot.yml` automated dependency update policy
- `/.github/PULL_REQUEST_TEMPLATE.md` PR template for governance

---

## Usage

- All workflows must be SHA‑pinned, least‑privilege, and validated by `validate-ci`.
- Composite actions are the preferred mechanism for shared logic.
- Dependabot groups batch low‑risk updates for GitHub Actions and npm.

---

## Governance

- Changes here affect all consuming repositories.
- Risk‑increasing changes require a documented decision.
