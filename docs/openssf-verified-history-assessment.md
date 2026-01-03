# OpenSSF "Verified History" Requirement Assessment

**Date**: 2026-01-02  
**Repository**: PoliticalSphere/ci  
**Requirement**: OpenSSF Best Practices Badge — Verified History  
**Status**: ⚠️ **PARTIALLY MEETS** (with clear path to full compliance)

---

## Requirement Summary

Every change in the revision's history MUST have:

1. **Strong authentication**: Author/uploader/reviewer with verified identity
2. **Two-step verification**: 2FA or cryptographic verification (e.g., GPG signatures)
3. **Clear verification**: Which identities were verified
4. **Timestamps**: For all authenticated actions
5. **First-parent history**: Only main branch merges in scope (not feature branches)

**Exception**: Historical cutoff allowed (e.g., last N months of changes)

---

## Current State Assessment

### 1. ✅ Strong Authentication (Partially Implemented)

#### Current Status
- **Author/uploader identity**: ✅ PRESENT
- **Reviewer identity**: ✅ PRESENT via GitHub PRs
- **Timestamps**: ✅ PRESENT for all commits

#### Evidence
```bash
# Example commit on main:
Commit:  8e7f91c035942a5d21b4838db04bcf869076fc6b
Author:  CI Bot <ci@example.com>
Date:    Sun Dec 28 18:51:22 2025 +0000
Message: fix(ci): use String.raw to avoid escaping backslashes...
GPG sig: VALID (Key: 56BF7719D0E29C34)

# Example merge commit (HEAD):
Commit:  725faa475448dd0d0c2da6bd15a54ed8644e9f14
Author:  PoliticalSphere <Morgan.Lowman@outlook.com>
Date:    Fri Jan 2 13:44:05 2026 +0000
Message: Merge pull request #14 from PoliticalSphere/chore/ci/...
GPG sig: EXPIRED (Key: B5690EEEBB952194)
```

### 2. ⚠️ Two-Step Verification (Partially Implemented)

#### GPG Signature Status

**Overall commit signing rate**: 260 signed (G) + 18 expired (E) + 3 unsigned (N) = 281 commits total

```
Status Breakdown:
- G (Valid signature):    260 commits (92.5%)
- E (Expired signature):   18 commits (6.4%)
- N (No signature):         3 commits (1.1%)
```

**Analysis**:
- ✅ Most commits (92.5%) are GPG-signed
- ⚠️ Some signatures expired (6.4%) — indicates key rotation issues
- ⚠️ Few unsigned commits (1.1%) — should be zero

#### Two-Factor Authentication (2FA) Status

**Current State**: ❌ NOT ENFORCED

- GitHub organization 2FA requirement: ❌ Not verified as enforced
- Reviewer 2FA status: ⚠️ Unknown (not explicitly documented)
- Automation service (CI Bot) 2FA: N/A (service accounts use SSH keys)

**Required for compliance**:
```yaml
Organization Settings → Security:
  - Enable "Require two-factor authentication for organization members"
  - Exception: Service accounts (CI Bot) use SSH/GPG keys
```

### 3. ⚠️ Clear Verification (Partially Documented)

#### What's Verified
| Identity Type | Verification Method | Status |
|---|---|---|
| Git commit author | GPG signature | ✅ Mostly verified |
| Pull request reviewer | GitHub PR review record | ✅ Verified |
| Timestamp | Git timestamp + GitHub timestamp | ✅ Verified |
| 2FA status | GitHub audit logs | ⚠️ Not enforced |

#### What's NOT Clear
- Which contributors have 2FA enabled
- Which service accounts use strong key management
- Verification policy for historical commits

### 4. ⚠️ First-Parent History (Compliant But Not Explicitly Scoped)

**Status**: ✅ MEETS

First-parent history for `main` branch:

```bash
# First-parent history (merges only):
725faa4 (HEAD) Merge pull request #14
f6eac50 (previous merge)
...
```

**Evidence**:
- Main branch uses PR merges (creates first-parent chain)
- Feature branches are not directly pushed
- All changes flow through merge commits

---

## Compliance Gap Analysis

### Gap 1: ❌ Require Signed Commits (Not Enforced)

**Current State**: Signed commits recommended but NOT enforced

**Evidence from branch-protection-guide.md**:
```yaml
### 5. Require Signed Commits
Configuration:
1. Repository Settings → Branches → Branch rule (main)
2. Enable "Require signed commits"
Note: Requires all contributors to set up GPG/SSH key signing.

Status: Pending | platform-governance
```

**Problem**:
- 1.1% of commits (3 commits) are unsigned
- No enforcement to prevent future unsigned commits
- HEAD commit has expired signature

**Impact**: Fails "verified history" requirement

### Gap 2: ⚠️ Organizational 2FA Not Enforced

**Current State**: 2FA policy not enforced at organization level

**Problem**:
- No guarantee all reviewers use 2FA
- Reduces identity verification strength
- Exposes to account takeover risks

**Impact**: Weakens "strong authentication" requirement

### Gap 3: ⚠️ GPG Key Rotation Issues

**Current State**: Some signatures marked as "expired"

```
HEAD (725faa4): Signature status = E (Expired)
Key: B5690EEEBB952194 (PoliticalSphere)
```

**Problem**:
- 6.4% of commits have expired signatures
- Indicates key management gaps
- Future validation may fail if keys not re-signed

**Impact**: Reduces cryptographic verification strength

### Gap 4: ❌ No Historical Cutoff Documented

**Current State**: No documented policy for historical commits

**Problem**:
- Requirement allows exceptions for existing projects
- This repo should formally adopt historical cutoff
- Enables compliance while addressing legacy commits

**Example policy**:
```yaml
# Proposed policy for docs/verified-history-policy.md
verified_history_policy:
  effective_date: 2026-01-02
  scope: "First-parent history of main branch from this date forward"
  requirements:
    - Every new commit MUST have valid GPG signature
    - Every reviewer MUST have 2FA enabled
    - No unsigned or expired commits allowed
  exceptions:
    - Historical commits (before 2026-01-02) exempt from GPG requirement
    - Transition period: 90 days for 2FA enforcement
    - Existing systems: SSH key-based auth acceptable for automation
```

---

## Remediation Roadmap

### CRITICAL (Must implement for badge)

| # | Action | Effort | Timeline |
|---|--------|--------|----------|
| 1 | **Enable "Require signed commits"** in branch protection | LOW | Immediate |
| 2 | **Enforce organization 2FA** requirement | LOW | Immediate |
| 3 | **Document verified history policy** with historical cutoff | LOW | This week |
| 4 | **Rotate expired GPG keys** (key B5690EE...) | MEDIUM | This week |

### HIGH (Strongly recommended)

| # | Action | Effort | Timeline |
|---|--------|--------|----------|
| 5 | Re-sign or cherry-pick 3 unsigned commits | MEDIUM | Q1 2026 |
| 6 | Create contributor guide for GPG setup | LOW | Q1 2026 |
| 7 | Audit all reviewers' 2FA status | MEDIUM | Q1 2026 |
| 8 | Document verification status in SECURITY.md | LOW | Q1 2026 |

### MEDIUM (Nice to have)

| # | Action | Effort | Timeline |
|---|--------|--------|----------|
| 9 | Automate GPG key rotation checks | MEDIUM | Q2 2026 |
| 10 | Add verified identity badges to PRs | LOW | Q2 2026 |

---

## Recommended Implementation Steps

### Step 1: Enable Signed Commit Requirement (Immediate)

```bash
# GitHub UI:
Settings → Branches → Branch rule (main)
→ Enable "Require signed commits"

# CLI (if using GitHub API):
curl -X PATCH https://api.github.com/repos/PoliticalSphere/ci/branches/main/protection \
  -H "Authorization: token $GITHUB_TOKEN" \
  -d '{"require_signed_commits": true}'
```

**Impact**: Prevents future unsigned commits

### Step 2: Enforce Organization 2FA (Immediate)

```bash
# GitHub UI:
Organization Settings → Security & analysis
→ Enable "Require two-factor authentication for organization members"

# Exceptions:
- Service accounts (CI Bot): Use SSH/GPG keys instead
- External contributors: Can use deploy keys
```

**Impact**: Ensures reviewer 2FA compliance

### Step 3: Document Verified History Policy (This Week)

Create `docs/verified-history-policy.md`:

```yaml
# Political Sphere — Verified History Policy
# Purpose: Meet OpenSSF badge requirement for cryptographically verified commits

effective_date: 2026-01-02
scope: "Main branch first-parent history from this date forward"

requirements:
  commit_signature:
    type: "GPG or SSH signature"
    status: "Must be valid (not expired)"
    enforcement: "Required by branch protection"
  
  reviewer_authentication:
    type: "GitHub user with 2FA enabled"
    enforcement: "Organizational requirement"
  
  author_authentication:
    type: "Verified Git author (GPG key or SSH key)"
    enforcement: "Branch protection signed commit requirement"

historical_exception:
  - Commits before 2026-01-02 are not required to have valid signatures
  - This allows existing projects to meet requirement without retroactive changes
  - SLSA 3/4 attestation: "Future commits from 2026-01-02 will meet requirements"

service_accounts:
  - CI Bot uses SSH key signing (acceptable for non-human actors)
  - SSH key stored in GitHub Actions secrets
  - Each workflow run creates signed commits with verified CI Bot identity

two_factor_authentication:
  enforcement: "Mandatory for all organization members"
  transition_period: "90 days from 2026-01-02 (grace period)"
  deadline: "2026-04-02"
  exceptions: "Service accounts use SSH/GPG keys; 2FA not applicable"

audit_trail:
  - All verified identities tracked in GitHub audit log
  - Monthly review of commit signature status
  - Alert on expired signatures (trigger key rotation)
  - SIEM integration for compliance monitoring
```

### Step 4: Rotate Expired GPG Key (This Week)

```bash
# Check current key status
git log -1 --format="%G? %GK %an" HEAD
# Output: E B5690EEEBB952194 PoliticalSphere

# Steps:
# 1. Generate new GPG key (or extend existing)
# 2. Add new key to GitHub account
# 3. Set as preferred signing key
# 4. Consider re-signing HEAD commit (if merge sign-off is re-needed)
# 5. Document rotation in risk-decisions.md
```

---

## First-Parent History Verification

### Scope Analysis

**First-parent history** (in scope):
```
725faa4 (HEAD) ← Merge pull request #14
8e7f91c       ← Committed by CI Bot (signed)
4c91d42       ← Committed by CI Bot (signed)
...
```

**Feature branches** (NOT in scope):
```
chore/ci/fix-build-action-input-safety
  └─ Not examined (only merge commit matters)
```

**Verification**:
- ✅ All first-parent commits are in scope
- ✅ All have timestamps
- ✅ Most have valid signatures (260 signed)
- ⚠️ 1 merge commit has expired signature (HEAD)
- ⚠️ 3 commits unsigned

---

## OpenSSF Badge Compliance Status

### Current Grade

| Criterion | Status | Gap |
|-----------|--------|-----|
| Strong authentication | ✅ MEETS | None |
| Two-step verification | ⚠️ PARTIAL | Org 2FA not enforced |
| Clear verification | ⚠️ PARTIAL | Needs documented policy |
| Signatures on commits | ✅ 92.5% meet | 1.1% unsigned, 6.4% expired |
| Reviewer verification | ✅ MEETS | 2FA status unknown |
| First-parent history | ✅ MEETS | None |
| Historical exception | ❌ MISSING | Needs documented cutoff |

### Verdict

**⚠️ DOES NOT YET MEET REQUIREMENT** (but very close)

**Missing pieces**:
1. ❌ Signed commits NOT enforced (allow unsigned/expired)
2. ❌ Organization 2FA NOT enforced
3. ❌ Verified history policy NOT documented
4. ⚠️ GPG key rotation needed (expired key)

**Effort to comply**: 4-6 hours across 3-4 tasks

---

## Recommended Path to Compliance

### Option A: Strict Compliance (RECOMMENDED)
Implement all requirements:
1. Enable signed commit enforcement
2. Enforce org 2FA
3. Document verified history policy
4. Rotate expired GPG key

**Timeline**: 1 week  
**Badge status**: ✅ COMPLIANT

### Option B: Historical Cutoff (SLSA 3/4 Alternative)
Document exception + immediate enforcement:
1. Document "historical cutoff" policy (as of today)
2. Enable signed commit enforcement (going forward)
3. Enforce org 2FA (90-day transition period)
4. Commit to meeting requirements for future changes

**Timeline**: 2 days  
**Badge status**: ⚠️ Partial (with attestation)

### Option C: Minimal Compliance
Quick wins only:
1. Enable signed commit enforcement
2. Document verified history policy with cutoff

**Timeline**: 1 day  
**Badge status**: ✅ Minimum (future commits only)

---

## Next Steps

1. **This week**:
   - [ ] Enable "Require signed commits" in branch protection
   - [ ] Enforce organization 2FA requirement
   - [ ] Create `docs/verified-history-policy.md`
   - [ ] Rotate expired GPG key

2. **Q1 2026**:
   - [ ] Audit contributor 2FA status
   - [ ] Create GPG setup guide for contributors
   - [ ] Add verification status to SECURITY.md

3. **Q2 2026**:
   - [ ] Automate signature verification checks
   - [ ] Document in OpenSSF badge submission

---

## References

- [OpenSSF Best Practices Badge Criteria](https://bestpractices.coreinfrastructure.org/en/criteria/0)
- [GitHub Commit Signature Verification](https://docs.github.com/en/authentication/managing-commit-signature-verification)
- [SLSA Framework: Provenance & Verification](https://slsa.dev/spec/v1.0/requirements)
- [Git Commit Signing Guide](https://git-scm.com/book/en/v2/Git-Tools-Signing-Your-Work)

---

**Status**: ⚠️ ACTIONABLE — Implement 4 recommended items for full compliance  
**Effort**: 4-6 hours  
**Blockers**: None — all recommendations are implementable immediately
