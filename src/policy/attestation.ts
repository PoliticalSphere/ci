/**
 * Policy Engine — AI Attestation Validation
 *
 * Validates AI-assisted development attestations declared in pull request
 * descriptions. Enforces disclosure, review, and governance requirements
 * proportionate to change risk.
 *
 * Core principles:
 * - Disclosure over detection
 * - Human accountability remains absolute
 * - Elevated risk requires elevated attestations
 */

export interface AIAttestation {
  readonly declared: boolean;
  readonly reviewed: boolean;
  readonly noSecrets: boolean;
  readonly alignsWithStandards: boolean;
  readonly locallyTested: boolean;
}

export interface AttestationValidation {
  readonly valid: boolean;
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * ============================================
 * Checkbox & Attestation Parsing Utilities
 * ============================================
 */

export const CHECKED_CHECKBOX_RE = /^\s*[-*][ \t]*\[x\][ \t]+(\S[^\r\n]*)$/i;

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replaceAll(/\*{1,3}/g, '') // remove markdown emphasis
    .replaceAll(/_{1,2}/g, '')
    .replaceAll(/\s+/g, ' ') // collapse whitespace
    .trim();
}

function extractCheckedTexts(body: string): string[] {
  const texts: string[] = [];
  for (const rawLine of (body ?? '').split(/\r?\n/)) {
    const m = CHECKED_CHECKBOX_RE.exec(rawLine);
    if (m) {
      texts.push(normalizeText(m[1] as string));
    }
  }
  return texts;
}

function hasCheckedAttestation(body: string, expected: string): boolean {
  const want = normalizeText(expected);
  const checked = extractCheckedTexts(body);
  return checked.some((t) => t.startsWith(want));
}

// Expected attestation labels (pre-normalized during comparison)
export const AI_ATTESTATION_LABELS = {
  declared: '**This PR contains AI-assisted changes**',
  reviewed: 'I have reviewed all AI-generated code',
  noSecrets: 'I have verified that no secrets',
  alignsWithStandards: 'The changes align with',
  locallyTested: 'I have tested the changes locally',
} as const;

export const HIGH_RISK_ATTESTATION_LABELS = {
  declared: '**This PR modifies high-risk paths**',
  understood: 'I understand the security and governance implications',
  securityReviewed: 'I have performed a manual security review',
  noPrivilegeEscalation: 'I have verified that no privilege escalation',
  documented: 'I have documented the rationale',
  rollbackPlan: 'I have a rollback plan',
  monitoringCommitment: 'I commit to monitoring',
} as const;

// Simple Levenshtein distance for near-match detection
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) {
    return n;
  }
  if (n === 0) {
    return m;
  }

  // Use a Map for DP state to avoid computed property access that can be flagged by
  // security/detect-object-injection. Map access is explicit and audited.
  const dp = new Map<number, number>();
  for (let j = 0; j <= n; j++) {
    dp.set(j, j);
  }

  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp.set(0, i);
    for (let j = 1; j <= n; j++) {
      const tmp = dp.get(j) ?? 0;
      const ac = a.codePointAt(i - 1) ?? 0;
      const bc = b.codePointAt(j - 1) ?? 0;
      const cost = ac === bc ? 0 : 1;
      const up = (dp.get(j) ?? Number.POSITIVE_INFINITY) + 1;
      const left = (dp.get(j - 1) ?? Number.POSITIVE_INFINITY) + 1;
      dp.set(j, Math.min(up, left, prev + cost));
      prev = tmp;
    }
  }

  return dp.get(n) ?? 0;
}

function findNearMatchesInChecked(expected: string, body = '', maxDistance = 3): string[] {
  const want = normalizeText(expected);
  const checked = extractCheckedTexts(body);
  const near: string[] = [];
  for (const t of checked) {
    // Only consider near-misses that don't already count as a match
    if (t.startsWith(want)) {
      continue;
    }
    const dist = levenshtein(t.slice(0, want.length), want);
    if (dist > 0 && dist <= maxDistance) {
      near.push(t);
    }
  }
  return near;
}

export function findAIAttestationNearMatches(prBody = '', maxDistance?: number): readonly string[] {
  const keys = ['reviewed', 'noSecrets', 'alignsWithStandards', 'locallyTested'] as const;
  return findNearMatchesForKeys(prBody, AI_ATTESTATION_LABELS, keys, maxDistance);
}

export function findHighRiskAttestationNearMatches(
  prBody = '',
  maxDistance?: number,
): readonly string[] {
  const keys = [
    'understood',
    'securityReviewed',
    'noPrivilegeEscalation',
    'documented',
    'rollbackPlan',
    'monitoringCommitment',
  ] as const;
  return findNearMatchesForKeys(prBody, HIGH_RISK_ATTESTATION_LABELS, keys, maxDistance);
}

function findNearMatchesForKeys<
  TLabels extends Record<string, string>,
  TKeys extends readonly (keyof TLabels & string)[],
>(prBody: string, labels: TLabels, keys: TKeys, maxDistance?: number): readonly string[] {
  const out: string[] = [];
  // Avoid dynamic object property access to satisfy security/detect-object-injection
  const safeLabels = new Map<string, string>(Object.entries(labels));
  for (const key of keys) {
    if (!safeLabels.has(key)) {
      continue;
    }
    const label = safeLabels.get(key);
    if (label === undefined) {
      continue;
    }
    const near = findNearMatchesInChecked(label, prBody, maxDistance);
    if (near.length > 0) {
      out.push(key);
    }
  }
  return out;
}

// Format validator for checkbox lines
export function validateCheckboxFormat(prBody = ''): { readonly issues: readonly string[] } {
  const issues: string[] = [];
  const body = typeof prBody === 'string' ? prBody : '';
  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = rawLine.trimStart();
    if (!/^[-*]\s*\[.\]/.test(trimmed)) {
      continue; // looks like a checkbox
    }
    if (!/^[-*]\s*\[x\]/.test(trimmed)) {
      issues.push(`Non-standard checkbox format: "${trimmed}"`);
    }
  }
  return { issues } as const;
}

/**
 * ============================================
 * AI Attestation Parsing
 * ============================================
 */

/**
 * Parse AI-assisted development attestations from PR body.
 *
 * The presence of the primary declaration checkbox determines whether
 * attestation enforcement applies at all.
 *
 * @example
 * const a = parseAIAttestation(prBody);
 * // a.declared === true/false
 */
export function parseAIAttestation(prBody = ''): AIAttestation {
  const body = prBody;
  const declared = hasCheckedAttestation(body, AI_ATTESTATION_LABELS.declared);

  // If AI assistance is not declared, treat as human-only change
  if (!declared) {
    return {
      declared: false,
      reviewed: false,
      noSecrets: false,
      alignsWithStandards: false,
      locallyTested: false,
    };
  }

  return {
    declared,
    reviewed: hasCheckedAttestation(body, AI_ATTESTATION_LABELS.reviewed),
    noSecrets: hasCheckedAttestation(body, AI_ATTESTATION_LABELS.noSecrets),
    alignsWithStandards: hasCheckedAttestation(body, AI_ATTESTATION_LABELS.alignsWithStandards),
    locallyTested: hasCheckedAttestation(body, AI_ATTESTATION_LABELS.locallyTested),
  };
}

/**
 * ============================================
 * AI Attestation Validation
 * ============================================
 */

/**
 * Validate completeness of AI attestations.
 *
 * Enforcement applies only when AI assistance is explicitly declared.
 *
 * @example
 * const att = parseAIAttestation(prBody);
 * const res = validateAttestation(att, 'low');
 * // res.valid === true/false
 */
export function validateAttestation(
  attestation: AIAttestation,
  riskTier: 'low' | 'medium' | 'high',
): AttestationValidation {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Human-only changes require no AI attestation
  if (!attestation.declared) {
    return { valid: true, missing, warnings };
  }

  // Core attestations required for all AI-assisted changes
  if (!attestation.reviewed) {
    missing.push('AI code review confirmation');
  }

  if (!attestation.noSecrets) {
    missing.push('No-secrets verification');
  }

  if (!attestation.alignsWithStandards) {
    missing.push('Standards alignment confirmation');
  }

  if (!attestation.locallyTested) {
    missing.push('Local testing confirmation');
  }

  // Elevated caution messaging for high-risk AI usage
  if (riskTier === 'high') {
    warnings.push(
      'High-risk changes with AI assistance require extra caution and manual security review',
    );
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * ============================================
 * High-Risk Attestation Parsing
 * ============================================
 */

/**
 * Parse attestations specific to high-risk path modifications.
 *
 * These attestations are required when trust boundaries, workflows,
 * governance, or supply-chain components are modified.
 */
export function parseHighRiskAttestation(prBody: string): {
  readonly declared: boolean;
  readonly understood: boolean;
  readonly securityReviewed: boolean;
  readonly noPrivilegeEscalation: boolean;
  readonly documented: boolean;
  readonly rollbackPlan: boolean;
  readonly monitoringCommitment: boolean;
} {
  const declared = hasCheckedAttestation(prBody, HIGH_RISK_ATTESTATION_LABELS.declared);

  if (!declared) {
    return {
      declared: false,
      understood: false,
      securityReviewed: false,
      noPrivilegeEscalation: false,
      documented: false,
      rollbackPlan: false,
      monitoringCommitment: false,
    };
  }

  return {
    declared,
    understood: hasCheckedAttestation(prBody, HIGH_RISK_ATTESTATION_LABELS.understood),
    securityReviewed: hasCheckedAttestation(prBody, HIGH_RISK_ATTESTATION_LABELS.securityReviewed),
    noPrivilegeEscalation: hasCheckedAttestation(
      prBody,
      HIGH_RISK_ATTESTATION_LABELS.noPrivilegeEscalation,
    ),
    documented: hasCheckedAttestation(prBody, HIGH_RISK_ATTESTATION_LABELS.documented),
    rollbackPlan: hasCheckedAttestation(prBody, HIGH_RISK_ATTESTATION_LABELS.rollbackPlan),
    monitoringCommitment: hasCheckedAttestation(
      prBody,
      HIGH_RISK_ATTESTATION_LABELS.monitoringCommitment,
    ),
  };
}

/**
 * ============================================
 * High-Risk Attestation Validation
 * ============================================
 */

/**
 * Validate completeness of high-risk attestations.
 *
 * Absence of declaration when high-risk paths are touched is a hard failure.
 *
 * @example
 * const att = parseHighRiskAttestation(prBody);
 * const res = validateHighRiskAttestation(att, true); // hasHighRiskPaths
 * // res.valid === true/false
 */
export function validateHighRiskAttestation(
  attestation: ReturnType<typeof parseHighRiskAttestation>,
  hasHighRiskPaths: boolean,
): AttestationValidation {
  const missing: string[] = [];
  const warnings: string[] = [];

  // No high-risk paths → no high-risk attestation required
  if (!hasHighRiskPaths) {
    return { valid: true, missing, warnings };
  }

  // High-risk paths touched but not declared → hard failure
  if (!attestation.declared) {
    missing.push('High-risk paths declaration (checkbox not checked)');
    return { valid: false, missing, warnings };
  }

  // Required high-risk attestations
  if (!attestation.understood) {
    missing.push('Security and governance implications understanding');
  }

  if (!attestation.securityReviewed) {
    missing.push('Manual security review');
  }

  if (!attestation.noPrivilegeEscalation) {
    missing.push('No privilege escalation verification');
  }

  if (!attestation.documented) {
    missing.push('Rationale documentation');
  }

  if (!attestation.rollbackPlan) {
    missing.push('Rollback plan');
  }

  if (!attestation.monitoringCommitment) {
    missing.push('Post-merge monitoring commitment');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Test Utilities (exposed for coverage)                                       */
/* -------------------------------------------------------------------------- */

// Expose the Levenshtein helper for targeted branch coverage in tests.
export const __test__levenshtein = levenshtein;
export const __test__extractCheckedTexts = extractCheckedTexts;
