# Political Sphere CI/CD Platform - Visual Workflow Architecture

## Overview Architecture

```mermaid
graph TB
    subgraph "External Triggers"
        PR[Pull Request Events]
        SCHED[Scheduled Events]
        MANUAL[Manual Dispatch]
        WORKFLOW[Workflow Call]
    end

    subgraph "Core Platform Workflows"
        PR_CHECKS[pr-checks.yml<br/>PR Validation Orchestrator]
        VALIDATE_CI[validate-ci.yml<br/>Policy Enforcement]
        PR_GATES[pr-gates.yml<br/>Quality Gates]
        LICENSE[license-compliance.yml<br/>License Policy]
        SECURITY[security-scheduled.yml<br/>Security Scanning]
        BUILD[build-artifacts.yml<br/>Build & Artifacts]
        RELEASE[release.yml<br/>Release Management]
        CONSUMER[consumer-contract.yml<br/>Consumer Validation]
    end

    subgraph "Platform Actions"
        JOB_SETUP[ps-bootstrap<br/>Canonical Bootstrap]
        CI_VALIDATE[ci-validate<br/>Policy Validation]
        UPLOAD_ARTIFACTS[ps-upload-artifacts<br/>Evidence Collection]
        PS_RUN[ps-run<br/>Script Execution]
        PS_SUMMARY[ps-write-summary<br/>Reporting]
    end

    subgraph "External Integrations"
        CODEQL[CodeQL Analysis]
        SEMGREP[Semgrep Analysis]
        SONAR[SonarCloud]
        DEPENDENCY[Dependency Review]
        GITLEAKS[GitLeaks]
    end

    PR --> PR_CHECKS
    SCHED --> SECURITY
    MANUAL --> SECURITY
    WORKFLOW --> VALIDATE_CI

    PR_CHECKS --> PR_GATES
    PR_CHECKS --> LICENSE
    
    PR_GATES --> VALIDATE_CI
    LICENSE --> VALIDATE_CI
    SECURITY --> VALIDATE_CI
    BUILD --> VALIDATE_CI
    RELEASE --> VALIDATE_CI
    CONSUMER --> VALIDATE_CI

    VALIDATE_CI --> JOB_SETUP
    VALIDATE_CI --> CI_VALIDATE
    PR_GATES --> JOB_SETUP
    PR_GATES --> UPLOAD_ARTIFACTS
    PR_GATES --> PS_RUN
    SECURITY --> CODEQL
    SECURITY --> SEMGREP
    PR_GATES --> DEPENDENCY

    PR_GATES --> SONAR
    SECURITY --> GITLEAKS
```

## Validate-CI Workflow Diagram

```mermaid
graph TD
    START([workflow_call Trigger])
    
    subgraph "Input Configuration"
        RUNNER[Runner Config]
        NODE[Node.js Version]
        DEPTH[Fetch Depth]
        CACHE[Caching Policy]
        CHECKOUT[Checkout Ref]
        PLATFORM[Platform Ref]
        INSTALL[Install Dependencies]
        VALIDATE[Validation Options]
        ARTIFACT[Artifact Config]
    end

    subgraph "Job Execution"
        JOB_SETUP[Job Setup PS<br/>- Harden Runner<br/>- Checkout Repository<br/>- Checkout Platform<br/>- Setup Node.js<br/>- Install Tools]
        INSTALL_PLATFORM[Install Platform Dependencies<br/>npm ci --no-audit --no-fund]
        CI_VALIDATE[Validate CI Policy<br/>- Action SHA Validation<br/>- Policy Compliance<br/>- Remote Verification]
        UPLOAD[Upload Evidence Artifacts<br/>- reports/**<br/>- logs/**]
    end

    START --> RUNNER
    START --> NODE
    START --> DEPTH
    START --> CACHE
    START --> CHECKOUT
    START --> PLATFORM
    START --> INSTALL
    START --> VALIDATE
    START --> ARTIFACT

    RUNNER --> JOB_SETUP
    NODE --> JOB_SETUP
    DEPTH --> JOB_SETUP
    CACHE --> JOB_SETUP
    CHECKOUT --> JOB_SETUP
    PLATFORM --> JOB_SETUP
    INSTALL --> JOB_SETUP

    JOB_SETUP --> INSTALL_PLATFORM
    INSTALL_PLATFORM --> CI_VALIDATE
    CI_VALIDATE --> UPLOAD

    UPLOAD --> SUCCESS([Validate-CI Complete])
    CI_VALIDATE --> FAILURE([Validation Failed])
```

## PR Gates Workflow Diagram

```mermaid
graph TD
    START([workflow_call + PR Context])
    
    subgraph "Input Configuration"
        RUNTIME[Runtime Config]
        PR_CONTEXT[PR Number, Base/Head SHAs]
        ARTIFACTS[Artifact Paths]
        COMMENTS[PR Comments Policy]
        SONAR[SonarCloud Config]
    end

    subgraph "Quality Gates"
        VALIDATE[Validate-CI<br/>Policy Gate]
        LINT[Lint<br/>ESLint, Biome, YAML]
        TYPECHECK[Typecheck<br/>TypeScript]
        TESTS[Tests<br/>Coverage, JUnit]
        JSCPD[Duplication<br/>JSCPD Analysis]
        BUILD[Build<br/>Clean Build]
        SECRETS[Secrets Scan<br/>PR-scoped]
        DEPENDENCY[Dependency Review<br/>Vulnerable deps]
    end

    subgraph "Optional Analysis"
        SONAR_ANALYSIS[SonarCloud<br/>Non-blocking]
    end

    subgraph "PR Feedback"
        COMMENT[PR Failure Comment<br/>Fork-safe]
        SUMMARY[Machine Summary<br/>JSON Report]
    end

    START --> RUNTIME
    START --> PR_CONTEXT
    START --> ARTIFACTS
    START --> COMMENTS
    START --> SONAR

    RUNTIME --> VALIDATE
    PR_CONTEXT --> VALIDATE
    VALIDATE --> LINT
    VALIDATE --> TYPECHECK
    VALIDATE --> TESTS
    VALIDATE --> JSCPD
    VALIDATE --> BUILD
    VALIDATE --> SECRETS
    VALIDATE --> DEPENDENCY

    TESTS --> SONAR_ANALYSIS
    TYPECHECK --> SONAR_ANALYSIS

    LINT --> COMMENT
    TYPECHECK --> COMMENT
    TESTS --> COMMENT
    JSCPD --> COMMENT
    BUILD --> COMMENT
    SECRETS --> COMMENT
    DEPENDENCY --> COMMENT

    LINT --> SUMMARY
    TYPECHECK --> SUMMARY
    TESTS --> SUMMARY
    JSCPD --> SUMMARY
    BUILD --> SUMMARY
    SECRETS --> SUMMARY
    DEPENDENCY --> SUMMARY
    SONAR_ANALYSIS --> SUMMARY

    COMMENT --> COMPLETE([PR Gates Complete])
    SUMMARY --> COMPLETE
```

## Security Scheduled Workflow Diagram

```mermaid
graph TD
    START([schedule | workflow_dispatch | workflow_call])
    
    subgraph "Input Configuration"
        RUNNER[Runner Config]
        LANGUAGES[CodeQL Languages]
        CACHE[Caching Policy]
    end

    subgraph "Security Scans"
        VALIDATE[Validate-CI<br/>Policy Gate]
        
        subgraph "Full History Scans"
            SECRETS[Secrets Scan<br/>Gitleaks Full History]
        end
        
        subgraph "Static Analysis"
            CODEQL[CodeQL Analysis<br/>SARIF Output]
            SEMGREP[Semgrep CE<br/>SARIF Output]
        end
        
        subgraph "Reporting"
            SUMMARY[Security Summary<br/>Machine Readable]
            SARIF_UPLOAD[SARIF Upload<br/>GitHub Security]
        end
    end

    START --> RUNNER
    START --> LANGUAGES
    START --> CACHE

    RUNNER --> VALIDATE
    LANGUAGES --> CODEQL
    CACHE --> SECRETS

    VALIDATE --> SECRETS
    VALIDATE --> CODEQL
    VALIDATE --> SEMGREP

    SECRETS --> SARIF_UPLOAD
    CODEQL --> SARIF_UPLOAD
    SEMGREP --> SARIF_UPLOAD

    SECRETS --> SUMMARY
    CODEQL --> SUMMARY
    SEMGREP --> SUMMARY

    SUMMARY --> COMPLETE([Security Analysis Complete])
```

## Release Workflow Diagram

```mermaid
graph TD
    START([workflow_call])
    
    subgraph "Release Configuration"
        VERSION[Release Version<br/>SemVer Required]
        REF[Release Ref<br/>Branch or SHA]
        NOTES[Generate Notes<br/>Auto-generation]
        RUNTIME[Runtime Config]
    end

    subgraph "Release Process"
        VALIDATE[Validate-CI<br/>Policy Gate]
        
        subgraph "Release Publishing"
            TAG[Create Git Tag<br/>v{version}]
            RELEASE[Publish GitHub Release<br/>Notes + Artifacts]
        end
        
        subgraph "Evidence & Reporting"
            ARTIFACTS[Upload Release Evidence<br/>Reports + Logs]
            SUMMARY[Release Summary<br/>Machine Readable]
        end
    end

    START --> VERSION
    START --> REF
    START --> NOTES
    START --> RUNTIME

    VERSION --> VALIDATE
    REF --> VALIDATE
    NOTES --> RELEASE
    RUNTIME --> VALIDATE

    VALIDATE --> TAG
    TAG --> RELEASE
    RELEASE --> ARTIFACTS
    ARTIFACTS --> SUMMARY

    SUMMARY --> COMPLETE([Release Complete])
```

## Build Artifacts Workflow Diagram

```mermaid
graph TD
    START([workflow_call])
    
    subgraph "Build Configuration"
        RUNTIME[Runtime Config]
        SCRIPT[Build Script Path]
        DIRECTORY[Working Directory]
        PATHS[Artifact Paths]
        TIMEOUT[Build Timeout]
    end

    subgraph "Build Process"
        VALIDATE[Validate-CI<br/>Policy Gate]
        
        subgraph "Build Execution"
            SETUP[Job Setup<br/>Dependencies + Tools]
            BUILD[Execute Build<br/>Deterministic Build]
        end
        
        subgraph "Artifact Management"
            UPLOAD[Upload Build Artifacts<br/>dist/**, build/**]
            EVIDENCE[Upload Evidence<br/>Reports + Logs]
        end
        
        SUMMARY[Build Summary<br/>Machine Readable]
    end

    START --> RUNTIME
    START --> SCRIPT
    START --> DIRECTORY
    START --> PATHS
    START --> TIMEOUT

    RUNTIME --> VALIDATE
    SCRIPT --> BUILD
    DIRECTORY --> SETUP
    PATHS --> UPLOAD
    TIMEOUT --> BUILD

    VALIDATE --> SETUP
    SETUP --> BUILD
    BUILD --> UPLOAD
    UPLOAD --> EVIDENCE
    EVIDENCE --> SUMMARY

    SUMMARY --> COMPLETE([Build Artifacts Complete])
```

## Consumer Contract Workflow Diagram

```mermaid
graph TD
    START([workflow_call])
    
    subgraph "Contract Configuration"
        RUNTIME[Runtime Config]
        POLICY[Policy Path]
        EXCEPTIONS[Exceptions Path]
        REPORT[Report Path]
    end

    subgraph "Validation Process"
        VALIDATE[Validate-CI<br/>Policy Gate]
        
        subgraph "Contract Checking"
            CHECKOUT[Checkout Repository]
            SETUP[Job Setup<br/>Node.js Only]
            CONTRACT[Contract Validation<br/>Policy Enforcement]
        end
        
        subgraph "Reporting"
            SUMMARY[Contract Summary<br/>JSON + Text]
            ARTIFACTS[Upload Evidence<br/>Reports + Logs]
        end
    end

    START --> RUNTIME
    START --> POLICY
    START --> EXCEPTIONS
    START --> REPORT

    RUNTIME --> VALIDATE
    POLICY --> CONTRACT
    EXCEPTIONS --> CONTRACT
    REPORT --> SUMMARY

    VALIDATE --> CHECKOUT
    CHECKOUT --> SETUP
    SETUP --> CONTRACT
    CONTRACT --> SUMMARY
    SUMMARY --> ARTIFACTS

    ARTIFACTS --> COMPLETE([Contract Validation Complete])
```

## License Compliance Workflow Diagram

```mermaid
graph TD
    START([workflow_call | pull_request])
    
    subgraph "License Configuration"
        RUNTIME[Runtime Config]
        LICENSE_POLICY[License Policy Path]
        LOCK_FILE[Lockfile Path]
        REPORT_DIR[Report Directory]
    end

    subgraph "Compliance Process"
        VALIDATE[Validate-CI<br/>Policy Gate]
        
        subgraph "License Analysis"
            SETUP[Job Setup<br/>Dependencies]
            LICENSE[License Compliance<br/>Policy Enforcement]
        end
        
        subgraph "Evidence Collection"
            UPLOAD[Upload License Reports<br/>Policy Violations]
            SUMMARY[Compliance Summary<br/>Machine Readable]
        end
    end

    START --> RUNTIME
    START --> LICENSE_POLICY
    START --> LOCK_FILE
    START --> REPORT_DIR

    RUNTIME --> VALIDATE
    LICENSE_POLICY --> LICENSE
    LOCK_FILE --> LICENSE
    REPORT_DIR --> UPLOAD

    VALIDATE --> SETUP
    SETUP --> LICENSE
    LICENSE --> UPLOAD
    UPLOAD --> SUMMARY

    SUMMARY --> COMPLETE([License Compliance Complete])
```

## Workflow Dependency Matrix

```mermaid
graph LR
    subgraph "Dependency Flow"
        VC[validate-ci.yml]
        PG[pr-gates.yml]
        LC[license-compliance.yml]
        SS[security-scheduled.yml]
        BA[build-artifacts.yml]
        RL[release.yml]
        CC[consumer-contract.yml]
        PRC[pr-checks.yml]
    end

    PG --> VC
    LC --> VC
    SS --> VC
    BA --> VC
    RL --> VC
    CC --> VC
    PRC --> PG
    PRC --> LC

    style VC fill:#e1f5fe
    style PG fill:#f3e5f5
    style LC fill:#e8f5e8
    style SS fill:#fff3e0
    style BA fill:#fce4ec
    style RL fill:#f1f8e9
    style CC fill:#e0f2f1
    style PRC fill:#fff8e1
```

## Execution Flow Timeline

```mermaid
gantt
    title Political Sphere Workflow Execution Timeline
    dateFormat X
    axisFormat %Ss

    section PR Validation
    Validate-CI           :active, v1, 0, 30s
    Lint                  :v2, after v1, 45s
    Typecheck            :v3, after v1, 30s
    Tests                :v4, after v1, 60s
    JSCPD                :v5, after v1, 40s
    Build                :v6, after v1, 50s
    Secrets Scan         :v7, after v1, 25s
    Dependency Review    :v8, after v1, 20s
    License Compliance   :v9, after v1, 35s

    section Release
    Validate-CI           :active, r1, 0, 30s
    Tag Creation          :r2, after r1, 10s
    Release Publishing    :r3, after r2, 20s
    Evidence Upload       :r4, after r3, 15s

    section Security Scan
    Validate-CI           :active, s1, 0, 30s
    Secrets Full Scan     :s2, after s1, 120s
    CodeQL Analysis       :s3, after s1, 180s
    Semgrep Analysis      :s4, after s1, 90s
    SARIF Upload          :s5, after s4, 10s
```

## Key Architectural Patterns

### 1. **Canonical Bootstrap Pattern**
```mermaid
graph TD
    WORKFLOW[Any Workflow Job]
    JOB_SETUP[ps-bootstrap Action<br/>Single Entry Point]
    EXECUTE[Execute Job Logic]
    UPLOAD[ps-upload-artifacts<br/>Evidence Collection]

    WORKFLOW --> JOB_SETUP
    JOB_SETUP --> EXECUTE
    EXECUTE --> UPLOAD
```

### 2. **Policy Gate Pattern**
```mermaid
graph TD
    TRIGGER[Workflow Trigger]
    VALIDATE[validate-ci.yml<br/>Policy Enforcement]
    EXECUTE[Execute Main Logic]
    EVIDENCE[Upload Evidence]

    TRIGGER --> VALIDATE
    VALIDATE --> EXECUTE
    EXECUTE --> EVIDENCE
```

### 3. **Evidence-First Pattern**
```mermaid
graph TD
    SUCCESS[Success Path]
    FAILURE[Failure Path]
    UPLOAD_SUCCESS[Upload Artifacts]
    UPLOAD_FAILURE[Upload Artifacts]
    SUMMARY[Generate Summary]

    SUCCESS --> UPLOAD_SUCCESS
    FAILURE --> UPLOAD_FAILURE
    UPLOAD_SUCCESS --> SUMMARY
    UPLOAD_FAILURE --> SUMMARY
```

## Security Architecture

```mermaid
graph TB
    subgraph "Permission Model"
        READ[contents: read]
        WRITE[contents: write]
        PR_WRITE[pull-requests: write]
        SECURITY[security-events: write]
    end

    subgraph "Workflow Security"
        PINNED[SHA-Pinned Actions]
        ISOLATED[Runner Isolation]
        AUDIT[Egress Audit]
        FORK_SAFE[Fork-Safe Design]
    end

    subgraph "Evidence Security"
        ENCRYPTED[Encrypted Artifacts]
        CONTROLLED[Controlled Access]
        RETENTION[Retention Policy]
    end

    READ --> ISOLATED
    WRITE --> PINNED
    PR_WRITE --> FORK_SAFE
    SECURITY --> AUDIT

    ENCRYPTED --> CONTROLLED
    CONTROLLED --> RETENTION
```

This visual documentation provides a comprehensive understanding of the Political Sphere CI/CD platform architecture, workflow dependencies, execution patterns, and security model. The diagrams illustrate the sophisticated design patterns and best practices implemented throughout the platform.