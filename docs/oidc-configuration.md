# OIDC Configuration & Trust Boundaries

This document defines the OpenID Connect (OIDC) configuration for the Political Sphere CI/CD platform and scopes trust boundaries for OIDC-based authentication.

---

## Overview

OIDC allows GitHub Actions workflows to authenticate with external services using short-lived tokens issued by GitHub's OIDC provider, eliminating the need to store long-lived secrets in repository credentials.

---

## OIDC Trust Model

### Provider
- **Issuer**: `token.actions.githubusercontent.com`
- **Subject Format**: `repo:{owner}/{repo}:{ref_type}:{ref}`
- **Token Lifetime**: 5 minutes (auto-renewed per job)

### Consumer (this platform)
- **Audience**: Service-specific (e.g., AWS, GCP, Azure)
- **Trust Scope**: Restricted by workflow, branch, and environment

---

## Trust Boundaries

### 1. Repository Level

All OIDC tokens are scoped to a single repository. Cross-repository token use is **forbidden**.

```yaml
# ✅ CORRECT: Token valid only for PoliticalSphere/ci
Subject: repo:PoliticalSphere/ci:ref:refs/heads/main
```

### 2. Workflow Level

OIDC trust is scoped to specific workflow purposes:

| Workflow | Use Case | Allowed Audience |
|----------|----------|------------------|
| `release.yml` | Publish releases, push artifacts | registry.npmjs.org, ghcr.io |
| `security-scheduled.yml` | Security scans, SARIF upload | sonarcloud.io |
| `pr-gates.yml` | Fast PR checks | None (read-only operations) |

**Rule**: Each workflow must declare its OIDC audiences explicitly.

### 3. Branch/Environment Level

Tokens can be further scoped to specific branches or environments:

```yaml
# Restrict OIDC to main branch only (release safety)
Subject: repo:PoliticalSphere/ci:ref:refs/heads/main
```

**Recommended Scoping:**
- `release.yml` → `main` branch only
- `security-scheduled.yml` → `main` branch
- `pr-gates.yml` → All branches (read-only)

### 4. Ref Type Restrictions

GitHub issues separate trust for:
- **Branch refs**: `ref:refs/heads/{branch}`
- **Tag refs**: `ref:refs/tags/{tag}`
- **PR refs**: `ref:refs/pull/{pr}/merge` (ephemeral)

**Policy**: Deployments and registry pushes must originate from `main` or tagged refs only.

---

## Configuration: AWS (Example)

If using AWS OIDC for deployment:

### 1. Create OIDC Provider in AWS IAM

```bash
# AWS Console → IAM → Identity Providers → OpenID Connect
# Provider URL: https://token.actions.githubusercontent.com
# Audience: sts.amazonaws.com
```

### 2. Create IAM Role with Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT-ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:PoliticalSphere/ci:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

### 3. Use in Workflow

```yaml
permissions:
  id-token: write  # Allow OIDC token issuance
  contents: read

steps:
  - name: Configure AWS Credentials
    uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::ACCOUNT-ID:role/GitHubActionsRole
      aws-region: us-east-1
      token-format: aws4
      web-identity-token-file: /tmp/awscreds
```

---

## Configuration: GCP (Example)

### 1. Create OIDC Provider in GCP

```bash
gcloud iam workload-identity-pools create github \
  --project=PROJECT-ID \
  --location=global \
  --display-name="GitHub"

gcloud iam workload-identity-pools providers create-oidc github \
  --project=PROJECT-ID \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### 2. Create Service Account with Workload Identity

```bash
gcloud iam service-accounts create github-actions
gcloud iam workload-identity-bindings create \
  --workload-identity-pool=github \
  --workload-identity-provider=github \
  --service-account=github-actions@PROJECT-ID.iam.gserviceaccount.com \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.repository == 'PoliticalSphere/ci'"
```

### 3. Use in Workflow

```yaml
permissions:
  id-token: write

steps:
  - name: Authenticate to Google Cloud
    uses: google-github-actions/auth@v1
    with:
      workload_identity_provider: projects/PROJECT-ID/locations/global/workloadIdentityPools/github/providers/github
      service_account: github-actions@PROJECT-ID.iam.gserviceaccount.com
```

---

## Configuration: Azure (Example)

### 1. Register GitHub as a Federated Credential

```bash
az ad app federated-credential create \
  --id <object-id> \
  --parameters '{
    "name": "github-actions",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:PoliticalSphere/ci:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### 2. Use in Workflow

```yaml
permissions:
  id-token: write

steps:
  - name: Authenticate to Azure
    uses: azure/login@v1
    with:
      client-id: <client-id>
      tenant-id: <tenant-id>
      subscription-id: <subscription-id>
```

---

## Audit & Monitoring

### 1. GitHub Audit Logs

Monitor OIDC token issuance in organization audit logs:

```bash
# Look for events:
# - OIDC token requested
# - Workflow execution with id-token permission
```

### 2. Cloud Provider Logs

- **AWS**: CloudTrail for `AssumeRoleWithWebIdentity` calls
- **GCP**: Cloud Audit Logs for `GetAccessToken` with workload identity
- **Azure**: Azure Activity Log for managed identity authentication

### 3. Anomaly Detection

Alert if:
- OIDC tokens requested from unexpected workflows
- Tokens assumed by unexpected service accounts
- Multiple failed authentication attempts

---

## Best Practices

1. **Principle of Least Privilege**
   - Scope OIDC to specific branches, workflows, and environments
   - Use separate service accounts per workflow type
   - Avoid wildcard (`*`) in subject conditions

2. **Audience Specificity**
   - Each external service gets its own audience
   - Audiences are service-specific (e.g., `sts.amazonaws.com`, not `*`)

3. **Token Lifetime**
   - GitHub auto-renews tokens per job (5-minute baseline)
   - Do not request long-lived tokens; use OIDC for each job

4. **Error Handling**
   - Fail fast on OIDC failures
   - Log failures for security team review
   - Never fall back to long-lived secrets

5. **Documentation**
   - Document which workflows use OIDC and why
   - Link trust policy to risk decisions
   - Include migration dates from long-lived secrets

---

## Rollout Timeline

| Phase | Target | Status |
|-------|--------|--------|
| Phase 1 | AWS deployments (if applicable) | Pending config |
| Phase 2 | SonarCloud authentication | Pending config |
| Phase 3 | Registry authentication (npm, Docker) | Pending config |
| Phase 4 | Deprecate long-lived tokens | Target: Q2 2026 |

---

## References

- [GitHub OIDC Token Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [AWS OIDC Configuration](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [GCP Workload Identity Federation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-google-cloud-platform)
- [Azure OIDC Configuration](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-azure)
