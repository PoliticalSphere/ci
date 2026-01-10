# Contributing to Political Sphere — CI

Thank you for contributing! This project expects contributions from both humans and AI systems. The following guide is written to be explicit, machine- and human-readable, and to help automated contributors and reviewers follow the same checks and expectations.

## Quick checklist (must pass before opening a PR)

- Run tests locally: `npm run test` (or `npm run test:coverage`) ✅
- Run linting and format checks: `npm run lint:all` ✅
- Add tests for any logic changes or bug fixes ✅
- Update documentation where behaviour or public API changes ✅
- Include a brief PR description and relevant links (design notes, issue number, related PRs) ✅
- If an AI assisted the change, add an "AI Attestation" comment in the PR body and a short `prompt history` section describing the prompt(s) used and the review steps taken ✅

## Development environment

- Node: use Node >= 22.21.1 (see `package.json` engines)
- Install dependencies: `npm ci`
- Run full tests: `npm run test`
- Run tests in watch mode: `npm run test:watch`
- Run tests with UI: `npm run test:ui`
- Run coverage: `npm run test:coverage`
- Run all linters: `npm run lint:all`

## Testing guidelines

- Tests are authoritative: any behavioural change that affects outputs should have test coverage.
- Prefer focused unit tests; avoid over-mocking unless necessary for isolation.
- Keep tests deterministic and fast.
- For changes to the UI/dashboard, add a test that exercises both TTY and non-TTY rendering modes.

## AI contributor guidance

- If an AI system authored or assisted the change, the PR MUST include:
  - An "AI Attestation" checkbox in the PR body (see `.github/pull_request_template.md`).
  - A short `prompt history` block describing prompts and temperature/configuration used.
  - A clear human review sign-off in the PR before merging (the human reviewer should verify tests, linting, and that attestations are complete).

- Do not rely on the model to be the final arbiter. Treat AI output as an assistive tool:
  - Validate generated code with tests and linters.
  - Ensure behaviour, edge cases, and security boundaries are reviewed by a human.

## PR & commit etiquette

- Use clear commit messages: prefix with a concise scope when helpful (e.g., `cli: fix dashboard rendering`).
- Small PRs are easier to review — prefer incremental, focused changes.
- Link the PR to an issue when relevant and include reproduction steps for bug fixes.
- Ensure CI is green before requesting final review.

## Review responsibilities

- Reviewers should verify: tests pass, linters are clean, and any AI-attested changes are reasonable and safe.
- For policy or governance changes, request a second reviewer with policy context.

## Contact & governance

If in doubt about the policy or governance implications of a change, open an issue or ping the maintainers via the repository's chosen communication channel.

---

Thanks for helping keep the platform robust, auditable, and secure.
