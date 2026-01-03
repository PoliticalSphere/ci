# ==============================================================================
# Political Sphere CI/CD Platform — Build Script (Makefile)
# ==============================================================================
# 
# PURPOSE
# --------
# Provide a single, deterministic build script that fully defines all build
# steps. Satisfies OpenSSF "Scripted build" criterion.
#
# USAGE
# ------
# make build       # Build all targets (default)
# make lint        # Run linting only
# make test        # Run tests only
# make ci           # Full CI pipeline (lint + typecheck + test + audit)
# make clean       # Clean build artifacts
#
# ==============================================================================

.PHONY: help build lint test ci clean typecheck audit preflight validate

# Default target
.DEFAULT_GOAL := help

# ==============================================================================
# VARIABLES
# ==============================================================================

NPM := npm -s
SHELL := /bin/bash

# ==============================================================================
# TARGETS
# ==============================================================================

help: ## Display this help message
	@echo "Political Sphere CI/CD Platform — Build Script"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
	@echo ""
	@echo "Default target: $(DEFAULT_GOAL)"

# ==============================================================================
# BUILD TARGETS
# ==============================================================================

build: ## Build all targets (no-op for platform repository)
	@echo "ℹ Build: no-op (platform repo)"
	@$(NPM) run build

lint: ## Run all linting (biome, eslint, yaml, actionlint, hadolint, shellcheck, markdown, cspell, knip)
	@echo "🔍 Linting..."
	@$(NPM) run lint:all

typecheck: ## Run TypeScript type checking
	@echo "📝 Type checking..."
	@$(NPM) run typecheck

test: ## Run test suite
	@echo "🧪 Testing..."
	@$(NPM) run test

audit: ## Run npm audit (moderate severity)
	@echo "🔐 Auditing dependencies..."
	@$(NPM) run audit

jscpd: ## Run code duplication detection
	@echo "🔍 Checking for code duplication..."
	@$(NPM) run jscpd

validate: ## Validate CI/CD configurations
	@echo "✓ Validating CI/CD..."
	@$(NPM) run validate-ci

evasion-scan: ## Scan for lint-evasion patterns
	@echo "🎯 Evasion scan..."
	@$(NPM) run evasion-scan

totem-check: ## Check architectural totem compliance
	@echo "🏛 Totem check..."
	@$(NPM) run totem-check

license-check: ## Check dependency licenses
	@echo "⚖ License check..."
	@$(NPM) run license-check

consumer-contract: ## Validate consumer contract
	@echo "📜 Consumer contract validation..."
	@$(NPM) run consumer-contract

# ==============================================================================
# GATE TARGETS (Pre-commit, pre-push validation)
# ==============================================================================

gate-pre-commit: ## Pre-commit gate (fast lint + security scan)
	@echo "🚪 Pre-commit gate..."
	@$(NPM) run gate:pre-commit

gate-pre-push: ## Pre-push gate (lint + typecheck + test + build + duplication)
	@echo "🚪 Pre-push gate..."
	@$(NPM) run gate:pre-push

# ==============================================================================
# COMPOSITE TARGETS
# ==============================================================================

preflight: ## Full preflight check (lint + typecheck + test + jscpd + audit)
	@echo "✈ Running preflight checks..."
	@$(NPM) run preflight

ci: ## Full CI pipeline (same as preflight)
	@echo "🚀 Running CI pipeline..."
	@$(NPM) run ci

quick: validate lint typecheck audit ## Quick checks (no tests, no jscpd)
	@echo "✓ Quick checks passed"

all: validate lint typecheck test audit jscpd evasion-scan totem-check license-check consumer-contract ## Run all checks
	@echo "✓ All checks passed"

# ==============================================================================
# MAINTENANCE TARGETS
# ==============================================================================

install: ## Install dependencies (via npm install)
	@echo "📦 Installing dependencies..."
	npm install

clean: ## Clean build artifacts and caches
	@echo "🧹 Cleaning..."
	@rm -rf dist build .eslintcache *.tsbuildinfo
	@npm run lint:fix --silent 2>/dev/null || true
	@echo "✓ Clean complete"

deps-update: ## Check for dependency updates
	@echo "📦 Checking for updates..."
	@npm outdated

# ==============================================================================
# DOCUMENTATION
# ==============================================================================

.PHONY: .openssf-compliant

.openssf-compliant: ## Verify OpenSSF "Scripted build" compliance
	@echo "OpenSSF Scripted Build Criterion"
	@echo "================================="
	@echo ""
	@echo "✓ All build steps are fully defined in this Makefile"
	@echo "✓ Single invocation point: 'make build' or 'make ci'"
	@echo "✓ No manual steps required beyond: make [target]"
	@echo ""
	@echo "Key targets:"
	@echo "  • make build    — Build (deterministic, reproducible)"
	@echo "  • make ci       — Full CI pipeline"
	@echo "  • make preflight — Preflight checks"
	@echo ""
	@echo "See: https://docs.github.com/en/code-security/supply-chain-security/end-to-end-supply-chain/about-end-to-end-supply-chain"
	@echo ""

# ==============================================================================
# NOTES
# ==============================================================================

# This Makefile serves as the authoritative build script for the Political Sphere
# CI/CD platform. All build steps are defined here and delegated to npm scripts.
#
# Rationale for delegation to npm scripts:
# - Scripts in package.json are version-controlled and testable locally
# - Each script is independently runnable for developer convenience
# - Makefile provides a single entry point that satisfies OpenSSF requirements
#
# OpenSSF "Scripted build" criterion (satisfied):
# > All build steps were fully defined in some sort of "build script".
# > The only manual command, if any, was to invoke the build script.
#
# Examples matching criterion:
# - "Build script is Makefile, invoked via make all" ← This repo (make build, make ci)
# - "Build script is .github/workflows/build.yaml" ← Also satisfied (.github/workflows)
#
# Development workflow:
# 1. Local: make preflight (before git push)
# 2. CI: make ci (in GitHub Actions)
# 3. Security: make all (for comprehensive validation)
