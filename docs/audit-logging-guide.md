# Audit Logging & Monitoring Guide

This document describes audit logging capabilities and setup for monitoring the Political Sphere CI/CD platform and consuming repositories.

---

## Overview

GitHub audit logs provide a comprehensive record of actions taken by users and automation within an organization. This guide focuses on:
1. Accessing and reviewing audit logs
2. Setting up alerts for security-relevant events
3. Monitoring CI/CD workflow execution and permission usage
4. Incident response using audit trails

---

## GitHub Organization Audit Logs

### Accessing Audit Logs

**Location**: Organization Settings → Audit log

**Accessible to**: Organization owners and members with appropriate permissions.

### Key Events to Monitor

| Event Category | Events | Purpose |
|---|---|---|
| **Workflow Security** | `workflow_run`, `workflow_job_run` | Detect unexpected workflow executions |
| **Token Management** | `personal_access_token.*`, `github_app_authorization.*` | Track credential creation/revocation |
| **Repository Security** | `branch_protection.*`, `secret.*` | Monitor branch rules and secrets changes |
| **Member Access** | `team_add_member`, `outside_collaborator.*` | Track access control changes |
| **Action Execution** | `runner.*` | Monitor self-hosted runner activity |

### Filtering Audit Logs

```bash
# Example: Search for all workflow runs in the past 30 days
# Organization Audit Log → Filter: action = "workflow_run"

# Export as CSV for analysis
# Organization Audit Log → Export CSV
```

---

## Setting Up Webhooks for Real-Time Alerts

### 1. Organization Webhook Configuration

**Location**: Organization Settings → Webhooks

**Payload URL**: Point to your monitoring system (e.g., Slack, PagerDuty, custom webhook receiver)

**Events to Subscribe To**:
```yaml
- workflow_job  # Workflow job start/complete
- repository    # Repository configuration changes
- organization  # Org-level events
- member        # Membership changes
- public_member # Public membership changes
```

### 2. Example: Slack Integration

```bash
# 1. Create Slack App or incoming webhook
# 2. Get webhook URL: https://hooks.slack.com/services/...
# 3. Add to GitHub Organization Webhooks
# 4. Set content type: application/json
```

### 3. Custom Webhook Receiver (Node.js Example)

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const SECURITY_ALERTS = [
  'branch_protection_rule.edited',
  'secret.created',
  'secret.deleted',
  'runner.created',
  'org_block.blocked_user',
];

// Verify GitHub webhook signature
function verifyWebhookSignature(req, secret) {
  const signature = req.headers['x-hub-signature-256'];
  const body = req.rawBody; // Ensure express middleware preserves raw body
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `sha256=${hash}` === signature;
}

app.post('/webhook', express.json(), (req, res) => {
  if (!verifyWebhookSignature(req, WEBHOOK_SECRET)) {
    return res.status(401).send('Unauthorized');
  }

  const { action, organization } = req.body;

  if (SECURITY_ALERTS.includes(action)) {
    console.warn(`[SECURITY ALERT] ${action} in ${organization.login}`);
    // Send to Slack, PagerDuty, SIEM, etc.
    notifySecurityTeam(action, req.body);
  }

  res.status(200).send('OK');
});

app.listen(3000);
```

---

## Repository Audit Logs

### Accessing Repository Audit Logs

**Location**: Repository Settings → Audit log (requires admin access)

### Key Events to Monitor in Repositories

| Event | Concern | Action |
|-------|---------|--------|
| `protected_branch.create` / `.delete` | Branch protection changes | Review if intentional |
| `repo_access_log.create` | Code access | Monitor for unusual patterns |
| `secret_scanning_alert.*` | Exposed credentials | Immediate incident response |
| `dependabot_alert.*` | Vulnerability discovery | Trigger patching workflow |
| `code_scanning_alert.*` | SAST findings | Triage per severity |

---

## Workflow Execution Monitoring

### 1. Workflow Audit Trail

Each workflow execution leaves an audit trail:
- Workflow trigger (user, webhook, schedule, manual dispatch)
- Input parameters
- Job execution order and status
- Artifact uploads
- Job timing and resources

### 2. Suspicious Patterns to Alert On

```yaml
# Alert if:
# - Workflow triggered by external fork PR with elevated permissions
# - Workflow skips security gates (e.g., validate-ci fails but deploy continues)
# - Workflow duration significantly exceeds baseline
# - Workflow downloads unusual external dependencies
# - Workflow accesses secrets in unexpected ways
```

### 3. Monitoring Tool Integration

**Option A: GitHub API Polling**
```bash
# Poll workflow runs API every 5 minutes
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/PoliticalSphere/ci/actions/runs?per_page=100" | jq '.workflow_runs[]'
```

**Option B: GitHub Actions Metrics Export**
- Use `actions/github-script@v6` to export metrics to CloudWatch, Datadog, or New Relic

---

## Permission Usage Auditing

### 1. Track GITHUB_TOKEN Usage

All workflows implicitly use `GITHUB_TOKEN`. Monitor for:
- Unexpected write operations (repo modification, force push)
- Cross-repository access (should be scoped to single repo)
- API calls to unusual endpoints

### 2. OIDC Token Auditing

Monitor cloud provider logs for unexpected OIDC token consumption:
- **AWS**: CloudTrail `AssumeRoleWithWebIdentity` calls
- **GCP**: Cloud Audit Logs for workload identity authentication
- **Azure**: Activity Log for managed identity sign-in events

---

## Incident Response Using Audit Logs

### 1. Credential Leak Detected

```bash
# 1. Search audit log for secret creation/modification around incident time
# Organization Audit Log → Filter: action = "secret.*"

# 2. Identify affected workflows
# Organization Audit Log → Filter: action = "workflow_run" AFTER secret was exposed

# 3. Revoke compromised credentials immediately
# Settings → Secrets → delete secret

# 4. Notify security team and affected services
# 5. Rotate all related credentials (see secrets-rotation-policy.md)
```

### 2. Unauthorized Workflow Execution

```bash
# 1. Search for workflow_run events with unexpected triggers
# Organization Audit Log → workflow_run + unexpected actor

# 2. Review workflow logs
# Repository → Actions → select run → review job output

# 3. Check for data exfiltration
# - Artifact uploads to external services
# - Environment variable leaks in logs
# - Unexpected git pushes

# 4. Disable compromised credentials and investigate root cause
```

### 3. Branch Protection Bypass

```bash
# 1. Search audit log: branch_protection_rule.edited / .deleted
# 2. Identify who made the change and when
# 3. Verify if change was authorized (check risk-decisions.md)
# 4. If unauthorized:
#    a. Restore branch protection immediately
#    b. Revoke access for unauthorized user
#    c. Run security review on recent merges
```

---

## Compliance & Retention

### 1. Audit Log Retention

- **GitHub Enterprise**: Organization audit logs retained indefinitely
- **GitHub Free/Pro/Team**: Limited to 90 days
- **Recommendation**: Export and archive audit logs quarterly for compliance

### 2. Export for Analysis

```bash
# Export via GitHub API
for page in {1..10}; do
  curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/orgs/PoliticalSphere/audit-log?page=$page&per_page=100" \
    >> audit-log.jsonl
done

# Archive to S3/GCS with encryption
aws s3 cp audit-log.jsonl s3://compliance-bucket/github-audit-$(date +%Y-%m-%d).jsonl \
  --sse AES256 --acl private
```

### 3. SIEM Integration (Optional)

Forward audit logs to centralized SIEM (e.g., Splunk, DataDog):

```python
import requests
import json
from datetime import datetime, timedelta

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
SIEM_URL = os.environ['SIEM_WEBHOOK_URL']

def fetch_and_forward_audit_logs():
    """Fetch org audit logs and forward to SIEM."""
    since = (datetime.now() - timedelta(hours=1)).isoformat()
    
    headers = {'Authorization': f'token {GITHUB_TOKEN}'}
    url = f'https://api.github.com/orgs/PoliticalSphere/audit-log?include=all&since={since}'
    
    resp = requests.get(url, headers=headers)
    logs = resp.json()
    
    for log in logs:
        # Enrich with context
        log['source'] = 'github-org-audit'
        log['timestamp'] = datetime.now().isoformat()
        
        # Forward to SIEM
        requests.post(SIEM_URL, json=log)

# Schedule to run every hour via cron or Lambda
```

---

## Alerting Rules

### Critical Alerts (PagerDuty / Immediate Notification)

```yaml
rules:
  - name: "Secret Exposed in Audit Log"
    condition: "event.action == 'secret.created' AND event.visibility == 'public'"
    severity: CRITICAL

  - name: "Branch Protection Disabled"
    condition: "event.action == 'branch_protection_rule.deleted'"
    severity: CRITICAL

  - name: "Unauthorized Access to Secrets"
    condition: "event.action == 'secret.read' AND event.actor != ALLOWED_ACTORS"
    severity: HIGH

  - name: "Workflow Permission Elevation"
    condition: "workflow_permissions.changes.BEFORE != workflow_permissions.changes.AFTER"
    severity: HIGH
```

### Informational Alerts (Slack / Daily Digest)

```yaml
rules:
  - name: "Daily Workflow Summary"
    condition: "daily aggregation"
    includes:
      - Total workflows run
      - Success/failure rates
      - Average job duration
      - Artifact uploads

  - name: "Dependency Update Summary"
    condition: "daily aggregation"
    includes:
      - Dependabot PRs created/merged
      - Vulnerability fixes
      - License compliance changes
```

---

## References

- [GitHub Audit Log Documentation](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)
- [GitHub Webhooks](https://docs.github.com/en/developers/webhooks-and-events/webhooks/about-webhooks)
- [GitHub API: Audit Log](https://docs.github.com/en/rest/orgs/orgs?apiVersion=2022-11-28#get-the-audit-log-for-an-organization)
- [Security Incident Response Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Incident_Response_Cheat_Sheet.html)
