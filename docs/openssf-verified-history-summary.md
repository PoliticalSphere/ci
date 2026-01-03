# OpenSSF "Verified History" Requirement: Summary

**Date**: 2026-01-02  
**Repository**: PoliticalSphere/ci  
**Assessment**: ⚠️ **PARTIALLY MEETS** (close to compliance)

---

## TL;DR

| Criterion | Status | Gap |
|-----------|--------|-----|
| **Strong authentication** | ✅ YES | None |
| **Two-step verification** | ⚠️ PARTIAL | Org 2FA not enforced |
| **Clear verification** | ⚠️ PARTIAL | Policy not documented |
| **Commit signatures** | ✅ YES (92.5%) | Allow unsigned, 1.1% unsigned, 6.4% expired |
| **Reviewer verification** | ✅ YES | 2FA not enforced org-wide |
| **First-parent history** | ✅ YES | None |

**Actions needed**: 4 tasks (4-6 hours)

---

## What's Working ✅

1. **260 of 281 commits are GPG signed** (92.5%)
   - CI Bot signs all commits automatically (SSH key)
   - Cryptographic verification in place

2. **Code review process tracked**
   - GitHub PR reviews record reviewer identity
   - Approval timestamps captured

3. **First-parent history correct**
   - Main branch uses merge commits (not rebase)
   - Only merges create first-parent chain

4. **Audit trail exists**
   - Git history immutable
   - GitHub audit logs capture all actions
   - Timestamps on all events

---

## What's Broken or Missing ⚠️

1. **Signed commits NOT ENFORCED** ❌
   - 1.1% of commits are unsigned (3 commits)
   - No branch protection rule to prevent unsigned commits
   - **Fix**: Enable "Require signed commits" in branch protection

2. **Organization 2FA NOT ENFORCED** ❌
   - No requirement for reviewers to use 2FA
   - Reduces strength of reviewer authentication
   - **Fix**: Enable org-wide 2FA requirement

3. **GPG key expired on HEAD** ⚠️
   - Latest merge commit signature status: EXPIRED
   - Key: B5690EEEBB952194 (PoliticalSphere)
   - **Fix**: Rotate or extend GPG key

4. **No documented policy** ❌
   - Requirement allows "historical cutoff" exception
   - This repo should formally adopt cutoff + document requirements
   - **Fix**: Create verified-history-policy.md

---

## Compliance Status by Metric

```
Metric 1: Strong Authentication
  ✅ Author identity tracked (Git commits)
  ✅ Reviewer identity tracked (GitHub PRs)
  ✅ Timestamps on all events
  Status: MEETS (with caveats on 2FA)

Metric 2: Cryptographic Verification
  ✅ 92.5% of commits GPG-signed
  ⚠️ 6.4% of signatures expired
  ❌ 1.1% unsigned commits (allow through)
  Status: PARTIALLY MEETS (needs enforcement)

Metric 3: Clear Verification
  ✅ Can show which commits are signed (git log)
  ⚠️ Cannot easily show 2FA status
  ❌ No policy documentation
  Status: PARTIALLY MEETS (needs documentation)

Metric 4: First-Parent History
  ✅ Main branch uses merge commits only
  ✅ Feature branches not directly committed
  ✅ Correct parent chain for first-parent
  Status: MEETS

Metric 5: Historical Exception
  ❌ Not formally documented
  Status: DOES NOT MEET (needs documentation)
```

---

## Why This Matters

**OpenSSF "Verified history" requirement ensures**:
- All code changes are authored by identified people
- All code reviews are by identified people
- Identity verification (2FA or cryptography)
- Changes can't be forged or attributed to wrong person
- Reduces risk of supply chain attacks

**Current gap**: 
- Can't guarantee 2FA was used for all reviewers
- Some commits don't have cryptographic proof

---

## Quick Implementation Path

### Phase 1: Enforcement (15 minutes + 30 minutes)
1. Enable "Require signed commits" in branch protection
2. Enforce organization 2FA

### Phase 2: Remediation (20 minutes)
3. Rotate/extend GPG key

### Phase 3: Documentation (30 minutes)
4. Create verified-history-policy.md

**Total time**: 4-6 hours over 1 week

---

## Where to Find Details

- **Full assessment**: `docs/openssf-verified-history-assessment.md`
- **Quick start guide**: `docs/verified-history-quick-start.md`
- **Branch protection setup**: `docs/branch-protection-guide.md`

---

## Next Steps

1. **Read**: `docs/verified-history-quick-start.md` (5 min)
2. **Implement**: The 4 critical actions (4-6 hours)
3. **Verify**: Run `git log --format="%G?" main | sort | uniq -c`
   - Expected: All G (signed), no N or E
4. **Document**: Add to OpenSSF badge application

---

**Status**: ⚠️ NEAR COMPLIANCE — All gaps are quickly fixable  
**Effort to full compliance**: 4-6 hours  
**Blockers**: None — all recommendations implementable immediately  
**Recommended completion**: By 2026-01-15
