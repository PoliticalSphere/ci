// ==============================================================================
// Political Sphere - Regex Safety Helpers
// ------------------------------------------------------------------------------
// Purpose:
//   Provide a minimal guard against catastrophic backtracking patterns.
// ==============================================================================

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
  let i = 0;
  const len = str.length;
  while (i < len) {
    const ch = str[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') {
      i = skipCharClass(str, i);
      continue;
    }
    if (isUnboundedQuantifierAt(str, i)) return true;
    i++;
  }
  return false;
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
  if (detectNestedUnbounded(pattern)) {
    throw new Error(
      `unsafe regex pattern detected (potential catastrophic backtracking): ${pattern}`,
    );
  }
  return new RegExp(pattern, flags);
}
