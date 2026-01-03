# Quick Start: Verified History Compliance

**Status**: ⚠️ PARTIALLY MEETS — 4 actions required for full compliance  
**Effort**: 4-6 hours  
**Deadline**: Q1 2026 (recommended: complete by 2026-01-15)

---

## The 4 Critical Actions

### 1. Enable Signed Commit Enforcement (15 minutes)

**GitHub UI Steps**:
1. Go to: Repository Settings → Branches
2. Click "Edit" on the "main" branch protection rule
3. Scroll to "Require signed commits" section
4. ✅ Check the box
5. Click "Save changes"

**Verification**:
```bash
# Test: Try to push unsigned commit to main
# Expected: Git push rejected with "Push rejected: commits must be signed"
```

**Impact**: Prevents all future unsigned commits

---

### 2. Enforce Organization 2FA (10 minutes)

**GitHub UI Steps**:
1. Go to: Organization Settings → Security
2. Look for "Two-factor authentication"
3. Click "Require two-factor authentication for organization members"
4. Set transition period: 90 days (grace period for setup)
5. Click "Enable"

**Important**:
- Service accounts (CI Bot): Use SSH keys instead (already compliant)
- Existing members: Get 90-day grace period

**Impact**: Ensures all human reviewers use 2FA

---

### 3. Rotate Expired GPG Key (20 minutes)

**Current Issue**:
```
HEAD commit signature: EXPIRED
Key ID: B5690EEEBB952194
User: PoliticalSphere <Morgan.Lowman@outlook.com>
```

**Solution A: Extend existing key** (recommended)
```bash
# On your local machine with GPG:
gpg --list-keys B5690EEEBB952194
gpg --edit-key B5690EEEBB952194
# In GPG menu:
# > expire
# Set new expiration: 5 years from now
# > save

# Re-export to GitHub:
gpg --armor --export B5690EEEBB952194 | pbcopy
# Paste into GitHub Settings → SSH and GPG keys
```

**Solution B: Create new key** (if needed)
```bash
gpg --gen-key
# Follow prompts; use same email (Morgan.Lowman@outlook.com)
# Export and add to GitHub Settings

git config --global user.signingkey <NEW_KEY_ID>
```

**Impact**: Ensures HEAD commit signature is valid

---

### 4. Document Verified History Policy (30 minutes)

**File to create**: `docs/verified-history-policy.md`

**Template** (use from full assessment, or simplified version below):

```markdown
# Verified History Policy

Effective: 2026-01-02

## Scope
Main branch first-parent history from this date forward.

## Requirements
1. **Commit signatures**: All commits MUST be GPG or SSH signed (valid, not expired)
2. **Reviewer 2FA**: All reviewers MUST use two-factor authentication
3. **Audit trail**: All identities tracked in GitHub audit log

## Historical Exception
Commits before 2026-01-02 are not required to have valid signatures.

## Service Accounts
CI Bot uses SSH key signing (complies with requirements).

## Enforcement
- Branch protection rule: "Require signed commits" ✅ ENABLED
- Organization setting: "Require 2FA" ✅ ENABLED (90-day transition)
- Audit: Monthly verification of signature status

## Questions?
See: docs/openssf-verified-history-assessment.md
```

**File to update**: `docs/SECURITY.md`

Add to section on security processes:
```markdown
### Verified History
All commits to main branch are cryptographically verified:
- GPG or SSH signed commits (required)
- Reviewed by 2FA-enabled members
- Audit trail: GitHub audit logs
- Policy: docs/verified-history-policy.md
```

---

## Implementation Checklist

```
IMMEDIATE (Today/Tomorrow):
☐ Enable "Require signed commits" in branch protection
☐ Enforce organization 2FA requirement
☐ Create docs/verified-history-policy.md

THIS WEEK:
☐ Rotate/extend expired GPG key (B5690EE...)
☐ Re-sign HEAD commit (if needed)
☐ Update SECURITY.md with verified history info

FOLLOW-UP (Q1 2026):
☐ Audit contributor 2FA status (after 90-day grace period)
☐ Create GPG setup guide: docs/gpg-signing-guide.md
☐ Add verification badge/status to README
☐ Document in OpenSSF badge application
```

---

## Verification Commands

### Check current status:
```bash
cd /Users/morganlowman/CI

# View signature status of recent commits
git log -10 --format="%G? %h %an %ad" --date=short

# View all unsigned commits
git log --all --format="%G?" | grep -c "^N"

# View all expired signatures
git log --all --format="%G?" | grep -c "^E"
```

### After implementing:
```bash
# All should show "G" (valid signature) or be after cutoff
# None should show "N" or "E"
git log --format="%G?" main | sort | uniq -c
# Expected output:
# 100+ G (good signatures)
# 0 N (unsigned)
# 0 E (expired)
```

---

## Current Status Summary

| Item | Status | Action |
|------|--------|--------|
| Commit signatures (92.5% signed) | ✅ Good | Enable enforcement to prevent unsigned |
| Expired signatures (6.4%) | ⚠️ Issue | Rotate GPG key |
| Reviewer authentication | ✅ Tracked | Enforce org 2FA |
| First-parent history | ✅ Correct | No action needed |
| Verified history policy | ❌ Missing | Create documentation |
| Organization 2FA | ❌ Not enforced | Enable + 90-day grace period |

---

## FAQ

**Q: Will enabling signed commits break existing PRs?**  
A: No. Only NEW commits to main require signatures. Existing commits are unaffected.

**Q: What if developers don't have GPG set up?**  
A: They'll get an error when pushing unsigned commits. Provide them with setup guide (docs/gpg-signing-guide.md).

**Q: Does CI Bot need GPG?**  
A: Yes, CI Bot commits MUST also be signed (already using SSH key signing).

**Q: Why 90-day grace period for 2FA?**  
A: Allows time for members to set up 2FA on personal accounts without immediate disruption.

**Q: What about the "E" (expired) signatures?**  
A: Rotating the GPG key (or extending it) will resolve this. Existing commits retain their timestamp but signature validation may fail.

**Q: Is this required for the OpenSSF badge?**  
A: Yes, "Verified history" is one of the official criteria at level 1+.

---

## Support & Questions

For detailed information:
- Full assessment: `docs/openssf-verified-history-assessment.md`
- Branch protection setup: `docs/branch-protection-guide.md`
- SECURITY policy: `SECURITY.md`

Questions? Reach out to @platform-governance or @security-team.

---

**Ready to proceed?** Start with Action #1 (takes 15 minutes).
