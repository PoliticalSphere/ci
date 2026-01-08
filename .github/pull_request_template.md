# Pull Request

<!-- 
PoliticalSphere CI/CD Platform — Pull Request Template

This template ensures consistent PR practices and enables AI governance controls.
Complete all applicable sections before submitting for review.
-->

## Summary

<!-- Provide a clear, concise description of the changes in this PR -->

## Changes

<!-- List the main changes, files modified, or features added -->

-
-

## AI-Assisted Development

<!-- 
AI-assisted development is a first-class and expected mode of development in Political Sphere.
Disclosure is required for governance and auditability.
-->

- [ ] **This PR contains AI-assisted changes**

<!-- ⚠️ If you checked the box above, complete the AI Attestation section below -->

### AI Attestation (Required if AI-assisted)

<!-- Complete these checkboxes if you declared AI assistance above -->

- [ ] I have reviewed all AI-generated code and accept responsibility for it
- [ ] I have verified that no secrets, credentials, or sensitive data are included
- [ ] The changes align with the project's architecture and coding standards
- [ ] I have tested the changes locally and confirmed they work as expected

## Risk Assessment

<!-- 
The CI policy engine will automatically classify risk based on paths touched.
If you are modifying high-risk paths (workflows, policies, scripts, supply chain),
additional attestation is required below.
-->

### High-Risk Changes (Complete if applicable)

<!-- 
High-risk paths include:
- .github/workflows/**, .github/actions/**
- tools/**, scripts/**
- policies/**, governance/**
- package.json, package-lock.json, .npmrc
- Security configs (.gitleaks.toml, CodeQL, etc.)
- Executable scripts (**/*.{sh,ts})
-->

- [ ] **This PR modifies high-risk paths** (workflows, policies, supply chain, or security configs)

<!-- ⚠️ If you checked the box above, complete the High-Risk Attestation section below -->

### High-Risk Attestation (Required if high-risk paths touched)

- [ ] I understand the security and governance implications of these changes
- [ ] I have performed a manual security review of the changes
- [ ] I have verified that no privilege escalation or bypass mechanisms are introduced
- [ ] I have documented the rationale for changes to enforcement or trust boundaries
- [ ] I have a rollback plan if these changes cause issues
- [ ] I commit to monitoring the impact of these changes after merge

## Testing

<!-- Describe how you tested these changes -->

- [ ] Local testing completed
- [ ] CI checks pass
- [ ] Manual verification performed (if applicable)

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code where necessary, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings or errors
- [ ] I have updated documentation if needed

## Additional Context

<!-- Add any other context, screenshots, or information about the PR here -->

---

<!-- 
This PR will be validated by the CI policy engine.
Risk classification and attestation validation are enforced as CI gates.
-->
