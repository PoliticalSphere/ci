// ==============================================================================
// Political Sphere - Regex Safety Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide a minimal guard against catastrophic backtracking patterns.
// ==============================================================================

import { createRequire } from 'node:module';

// Prefer RE2 if available to avoid backtracking-based DoS.
let RE2 = null;
try {
  const require = createRequire(import.meta.url);
  RE2 = require('re2');
} catch {
  RE2 = null;
}

function parseBraceQuantifier(str, i) {
  const slice = str.slice(i);
  const match = slice.match(/^\{\s*(\d*)\s*(?:,\s*(\d*)\s*)?\}/);
  if (!match) {
    return { isQuantifier: false, isUnbounded: false, endIndex: i };
  }

  const hasComma = match[0].includes(',');
  const digitsBefore = match[1] || '';
  const digitsAfter = match[2] || '';

  if (!hasComma && digitsBefore.length === 0) {
    return { isQuantifier: false, isUnbounded: false, endIndex: i };
  }

  const endIndex = i + match[0].length - 1;
  const isUnbounded = hasComma && digitsAfter.length === 0;
  return { isQuantifier: true, isUnbounded, endIndex };
}

function skipCharClass(str, idx) {
  const len = str.length;
  idx++;
  while (idx < len) {
    if (str[idx] === '\\') {
      idx += 2;
      continue;
    }
    if (str[idx] === ']') {
      idx++;
      break;
    }
    idx++;
  }
  return idx;
}

/**
 * Scans a regex pattern, calling visitor for each significant character.
 * Handles escape sequences and character classes automatically.
 * @param {string} pat - The pattern to scan
 * @param {function} visitor - Called with (char, index, pattern). Return true to stop.
 * @returns {*} The return value from visitor if it stopped, otherwise false.
 */
function scanPattern(pat, visitor) {
  const len = pat.length;
  let i = 0;
  while (i < len) {
    const ch = pat[i];
    if (ch === '\\') {
      const result = visitor(ch, i, pat, true);
      if (result !== undefined && result !== false) return result;
      i += 2;
      continue;
    }
    if (ch === '[') {
      i = skipCharClass(pat, i);
      continue;
    }
    const result = visitor(ch, i, pat, false);
    if (result !== undefined && result !== false) return result;
    i++;
  }
  return false;
}

function hasLookaround(pat) {
  return scanPattern(pat, (ch, i, p, isEscape) => {
    if (isEscape) return false;
    if (ch === '(' && p[i + 1] === '?') {
      const next = p[i + 2];
      if (next === '=' || next === '!') return true;
      if (next === '<' && (p[i + 3] === '=' || p[i + 3] === '!')) return true;
    }
    return false;
  });
}

function hasBackreference(pat) {
  return scanPattern(pat, (ch, i, p, isEscape) => {
    if (isEscape) {
      const next = p[i + 1];
      if (next >= '1' && next <= '9') return true;
      if (next === 'k' && (p[i + 2] === '<' || p[i + 2] === "'")) return true;
    }
    return false;
  });
}

function isUnboundedQuantifierAt(str, idx) {
  const ch = str[idx];
  if (ch === '+' || ch === '*') return true;
  if (ch === '{') {
    const q = parseBraceQuantifier(str, idx);
    return q.isQuantifier && q.isUnbounded;
  }
  return false;
}

function hasUnboundedQuantifierIn(str) {
  return scanPattern(str, (ch, i) => isUnboundedQuantifierAt(str, i));
}

function findGroupEnd(pat, idx) {
  const len = pat.length;
  let depth = 1;
  let j = idx + 1;
  while (j < len && depth > 0) {
    if (pat[j] === '\\') {
      j += 2;
      continue;
    }
    if (pat[j] === '[') {
      j = skipCharClass(pat, j);
      continue;
    }
    if (pat[j] === '(') {
      depth++;
    } else if (pat[j] === ')') {
      depth--;
    }
    j++;
  }
  if (depth !== 0) return -1;
  return j - 1;
}

function hasOuterUnboundedAt(pat, pos) {
  const len = pat.length;
  let k = pos;
  while (k < len && /\s/.test(pat[k])) k++;
  if (k >= len) return false;
  if (pat[k] === '+' || pat[k] === '*') return true;
  if (pat[k] === '{') {
    const q = parseBraceQuantifier(pat, k);
    return q.isQuantifier && q.isUnbounded;
  }
  return false;
}

function detectNestedUnbounded(pat) {
  const len = pat.length;
  let i = 0;

  while (i < len) {
    const ch = pat[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') {
      i = skipCharClass(pat, i);
      continue;
    }
    if (ch === '(') {
      const end = findGroupEnd(pat, i);
      if (end === -1) return false;
      const inner = pat.slice(i + 1, end);
      if (
        hasUnboundedQuantifierIn(inner) &&
        hasOuterUnboundedAt(pat, end + 1)
      ) {
        return true;
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return false;
}

export function safeCompileRegex(pattern, flags = '') {
  if (/[^gimsu]/.test(flags)) {
    throw new Error(`unsupported regex flags '${flags}'`);
  }
  if (hasLookaround(pattern) || hasBackreference(pattern)) {
    throw new Error(
      `unsafe regex pattern detected (backreference/lookaround): ${pattern}`,
    );
  }
  if (detectNestedUnbounded(pattern)) {
    throw new Error(
      `unsafe regex pattern detected (potential catastrophic backtracking): ${pattern}`,
    );
  }
  if (RE2) return new RE2(pattern, flags);
  return new RegExp(pattern, flags);
}
