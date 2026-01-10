# M1: Shell Mode Potential Risk - Security Documentation

**Risk Level:** LOW (Current Status)  
**File:** `src/cli/modules/process-manager.ts:66`  
**Date Documented:** January 2026

## Overview

The process manager conditionally enables shell mode when spawning linter processes:

```typescript
const proc = spawn(linter.binary, spawnArgs, {
  shell: linter.mode === 'shell', // Registry only uses 'direct' mode
  // ...
});
```

### Current Status: LOW RISK

The registry (`src/cli/config/linter-registry.ts`) **only uses `'direct'` mode**, which means `shell: false` is always set in practice. Shell mode is disabled by default and requires explicit configuration.

## Security Risk Analysis

### Why Shell Mode Is Dangerous

When `shell: true` is used with Node's `spawn()`, the operating system's shell interprets the command and arguments. This creates an injection vector if any arguments come from untrusted sources.

The shell interprets these special characters:

- **Command chaining:** `;` `&` `|` `&&` `||`
- **Command substitution:** `` ` `` `$(...)`
- **Grouping:** `()` `{}` `[]`
- **Escaping/quoting:** `\` `'` `"`
- **Redirection:** `<` `>`
- **Variable expansion:** `$VAR` `${VAR}`
- **Globbing:** `*` `?` `[...]`
- **Newlines:** `\n` `\r`

### Example Attack Scenario

If user input were allowed in shell mode (hypothetical):

```typescript
// DANGEROUS - DO NOT DO THIS
const userInput = '; rm -rf /'; // Attacker-controlled
spawn('linter', [userInput], { shell: true }); // Command injection!
```

The shell would execute: `linter ; rm -rf /`

## Current Protections

### 1. Shell Mode Disabled by Default

- The registry only uses `mode: 'direct'`
- All production linters use direct mode

### 2. Validation Layer (Defense in Depth)

If shell mode were to be used, `validateShellCommand()` checks all arguments:

```typescript
const DANGEROUS_SHELL_CHARS_REGEX = /[;&|`$(){}[\]\n\r\\'"<>]/;

function validateShellCommand(config: LinterConfig): void {
  if (config.mode !== 'shell') return;
  
  for (const arg of config.args) {
    if (DANGEROUS_SHELL_CHARS_REGEX.test(arg)) {
      throw new CliError('CLI_INVALID_ARGUMENT', 
        `Potentially dangerous shell characters in args for: ${config.id}`);
    }
  }
}
```

### 3. Static Registry

- Linter configurations are static and cannot be modified at runtime
- All arguments are fixed at configuration time
- No external data flows into linter.args

## Risk Mitigation Strategy

### ✅ What's Already Protected

1. **Registry-only configuration** - No dynamic linter configuration
2. **Static arguments** - All linter arguments are hardcoded
3. **Direct mode default** - Shell is disabled unless explicitly configured
4. **Validation function** - Dangerous characters are rejected if shell mode is used
5. **No CLI-to-linter argument passing** - User CLI args don't propagate to spawn

### ⚠️ Conditions That Would Increase Risk

Shell mode would become MEDIUM or HIGH RISK if any of these occurred:

1. **External input reaches linter.args**
   - CLI arguments passed to linters
   - Configuration files control linter arguments
   - API accepts custom linter configurations

2. **Dynamic linter registration**
   - Linters loaded from external sources
   - Configuration updated during runtime

3. **User-controlled shell mode**
   - Allowing selection between 'direct' and 'shell' mode
   - Plugin systems that register linters with shell mode

## Recommendations

### For Current Code (LOW RISK → NO RISK)

1. **Documentation** ✅ (DONE)
   - Add security warnings to both files
   - Explain why shell mode is dangerous
   - Link to this document

2. **Keep Direct Mode Default** ✅ (ONGOING)
   - Maintain `mode: 'direct'` for all registry entries
   - Never use shell mode unless there's a compelling reason

3. **Code Review Practice**
   - Any change to spawn options requires security review
   - Any new shell mode usage must include threat analysis

### If Shell Mode Must Be Used (Future)

If there's a legitimate need for shell mode in the future:

1. **Implement multi-layer validation**
   - Registry-level: Validate dangerous characters (current)
   - Input-level: Validate before reaching linter config
   - Execution-level: Log all shell mode execution

2. **Use safer alternatives**
   - Use `spawn()` with `shell: false` and explicit arguments
   - Use `execFileSync()` which doesn't spawn a shell
   - Avoid shell mode entirely if possible

3. **Audit and monitoring**
   - Log all shell mode executions with timestamp and context
   - Implement alerting for shell mode usage
   - Regular security audits of execution patterns

4. **Architecture review**
   - Question whether shell mode is actually needed
   - Consider refactoring to avoid shell mode
   - Evaluate alternative approaches (direct execution, APIs)

## Related Code Locations

| File | Purpose |
| --- | --------- |
| `src/cli/modules/process-manager.ts` | Main risk location - spawn call |
| `src/cli/config/linter-registry.ts` | Where `LinterConfig` is defined |
| `src/cli/config/linter-registry.ts:311` | `validateShellCommand()` function |
| `src/cli/config/linter-registry.ts:293` | `DANGEROUS_SHELL_CHARS_REGEX` definition |

## Testing

The following test scenarios should be maintained:

```typescript
// ✅ Should pass - no dangerous characters
validateShellCommand({ mode: 'shell', args: ['--flag', 'value'] });

// ✅ Should pass - direct mode always allowed
validateShellCommand({ mode: 'direct', args: ['any', 'input'] });

// ❌ Should fail - dangerous characters
validateShellCommand({ mode: 'shell', args: ['value;rm'] });
validateShellCommand({ mode: 'shell', args: ['$(evil)'] });
validateShellCommand({ mode: 'shell', args: ['`command`'] });
```

## References

- [OWASP: Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [CWE-78: Improper Neutralization of Special Elements used in an OS Command](https://cwe.mitre.org/data/definitions/78.html)
- [Node.js Child Process Documentation](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
- [CVE Examples: Shell Injection Vulnerabilities](https://cve.mitre.org/cgi-bin/cvekey.cgi?keyword=shell%20injection)

## Sign-Off

- **Status:** ✅ Documented and Protected
- **Requires Action:** No (current architecture is safe)
- **Monitoring:** Monitor for any changes to spawn() options or shell mode usage
- **Review Date:** Quarterly or when shell mode usage is considered
