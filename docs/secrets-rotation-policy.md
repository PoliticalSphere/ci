# Secrets Rotation Policy

This document defines the secrets rotation policy for the Political Sphere CI/CD platform.

---

## Overview

Secrets rotation reduces the window of exposure if a credential is accidentally leaked or compromised. This policy ensures all long-lived secrets used in CI/CD workflows are rotated on a regular, documented cadence.

---

## Classification of Secrets

### Category A: Service Account Tokens
- GitHub Personal Access Tokens (PAT)
- npm registry tokens
- Docker Hub credentials
- SonarCloud API tokens
- Any long-lived service account credentials

**Rotation Cadence:** 90 days

### Category B: API Keys (External Services)
- Third-party SaaS API keys
- Cloud provider credentials (AWS, GCP, Azure)
- Deployment webhook tokens

**Rotation Cadence:** 180 days or at provider discretion

### Category C: OIDC Credentials
- GitHub OIDC tokens (short-lived, auto-issued per job)
- Do not require rotation (ephemeral by design)

**Rotation Cadence:** N/A (automatic)

---

## Rotation Procedure

### 1. GitHub Repository Secrets

**Location:** Settings → Secrets and variables → Actions

**Process:**
```bash
# 1. Generate new secret (follow provider's guidance)
# 2. Store as temporary environment variable
NEW_SECRET="<new_credential>"

# 3. Update GitHub Repository Secret
#    - Go to Settings → Secrets and variables → Actions
#    - Click "New repository secret"
#    - Name: same as existing secret
#    - Value: <new_credential>
#    - Click "Add secret"

# 4. Test new secret in a branch before full rollout
# 5. Revoke old secret in upstream service
# 6. Document rotation in risk-decisions.md (see template below)
```

### 2. NPM Registry Token

```bash
# List current tokens
npm token list

# Revoke old token
npm token revoke <token-id>

# Create new token
npm token create --read-only  # For CI publishing

# Update GitHub secret
# Settings → Secrets → NPM_AUTH_TOKEN
```

### 3. Docker Credentials

```bash
# Update via Docker Hub account settings
# Generate new personal access token
# Settings → Security → Personal Access Tokens → New Token

# Update GitHub secret
# Settings → Secrets → DOCKER_USERNAME, DOCKER_PASSWORD
```

### 4. SonarCloud Token

```bash
# Via SonarCloud UI
# Account → Security → Generate Tokens

# Update GitHub secrets
# Settings → Secrets → SONAR_TOKEN, SONAR_ORGANIZATION
```

---

## Rotation Schedule

| Secret Type | Rotation Date | Owner | Status |
|-------------|---------------|-------|--------|
| GitHub PAT  | 2026-03-31    | Platform Team | Due Q1 2026 |
| npm Token   | 2026-03-31    | Platform Team | Due Q1 2026 |
| SonarCloud  | 2026-06-30    | Platform Team | Due Q2 2026 |
| Docker      | 2026-06-30    | Platform Team | Due Q2 2026 |

---

## Audit Trail

All secret rotations must be documented with:
- **Date**: When the rotation was performed
- **Secret**: Type/name (not the value)
- **Owner**: Who performed the rotation
- **Rationale**: Scheduled rotation or incident response
- **Risk Decision**: Reference if applicable (e.g., RD-2026-007)

Example:
```yaml
- id: RD-2026-007
  date: 2026-03-31
  owner: platform-team
  scope: GitHub PAT rotation
  decision: Scheduled 90-day rotation for GitHub Personal Access Token
  rationale: Compliance with secrets rotation policy.
  expires: 2026-06-30
  approval: security-team
```

---

## Incident Response

If a secret is suspected to be compromised:

1. **Immediately revoke** the compromised credential in the upstream service.
2. **Generate new credential** following the provider's guidance.
3. **Update GitHub secret** without delay.
4. **Document incident** in risk-decisions.md with:
   - Date and time of discovery
   - Scope of exposure (if known)
   - Remediation steps taken
   - Post-incident review findings
5. **Notify** security team and affected stakeholders.

---

## Monitoring & Alerts

- GitHub secret access is logged in organization audit logs.
- Set up GitHub Actions alerts for secret usage anomalies.
- Review audit logs monthly for unauthorized access patterns.

---

## References

- [GitHub Documentation: Encrypted secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [npm Token Management](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
- [SonarCloud Token Security](https://docs.sonarcloud.io/advanced-setup/tokens/)
