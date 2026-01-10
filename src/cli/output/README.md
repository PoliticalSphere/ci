# CLI — Output (UI)

> Dashboard and output rendering for the CLI (Ink-based)

This folder contains the rendering layer for the CLI that presents linter execution status to users. It focuses on read-only, deterministic rendering and intentionally avoids business logic or policy decisions.

Files

- `ui.tsx` — Ink-based dashboard component and a non-TTY static renderer. Exposes `renderDashboard`, `renderWaitingHeader`, and several test helpers in `__test__`.
- `index.ts` — thin re-exports for the output API.

Key behaviors & guarantees 🔧

- Dual-mode rendering:
  - **TTY (interactive)**: renders a live Ink dashboard (`renderDashboard`) with status updates, spinner for running linters, and a summary footer. The dashboard unmounts cleanly when execution completes.
  - **Non-TTY (piped)**: renders a deterministic, static text view (`renderStaticDashboard`/`renderStaticHeader`) suitable for piping or CI logs.
- Hyperlinks: when supported, log paths are emitted as OSC 8 hyperlinks for one-click opening of logs; fallback to raw paths when not supported.
- Accessibility: status display uses both color and symbols to aid users with color-vision differences.
- Determinism: static renderer outputs a consistent table-like layout and summary suitable for capture and verification.

Public API

- `renderDashboard(linters, logDir, streams?)` → `{ updateStatus(id, status), waitForExit() }`
  - Returns a small imperatively-driven interface used by the execution layer to publish status updates and await completion.
- `renderWaitingHeader(message?, streams?)` → `{ unmount() }`
  - Renders a simple waiting screen used while acquiring locks.

Testing guidance ✅

- Unit tests should cover:
  - TTY vs non-TTY branches (simulate `stdout.isTTY`)
  - Status transitions and queuing of updates before the UI mounts
  - `renderWaitingHeader` behaviour and unmount semantics
  - Hyperlink generation and fallback when OSC8 is not supported
  - Error boundary: ensure `DashboardErrorBoundary` renders an error message and that the Dashboard doesn't crash the process
- The module exposes test helpers (`__test__`) for utilities like `supportsOsc8`, `supportsColor`, and components that are useful to render statically in tests.

Examples

- Render a dashboard and update status

```ts
import { renderDashboard } from './output/ui';
const dashboard = renderDashboard(linters, './logs');
dashboard.updateStatus('eslint', 'RUNNING');
// later
dashboard.updateStatus('eslint', 'PASS');
await dashboard.waitForExit();
```

- Render waiting header (e.g., while waiting for lock)

```ts
const header = renderWaitingHeader();
// later
header.unmount();
```

Notes & design decisions 📝

- UI intentionally avoids making execution decisions; it is a view-layer only.
- Use `renderDashboard`'s small imperative surface rather than mounting React directly from other modules — this keeps the integration simple and testable.
- Keep visual constants (column widths, padding, symbols) small and centralized to make style adjustments straightforward.
