#!/usr/bin/env python3
# ==============================================================================
# Political Sphere — Task Report Emitter
# ==============================================================================
#
# METADATA
# ------------------------------------------------------------------------------
# id: ps-emit-report
# version: 1.1.0
# owner: political-sphere
# classification: internal
# created: 2025-12-26
# last_updated: 2025-12-26
#
# DEPENDENCIES
# ------------------------------------------------------------------------------
# - python3
#
# DEPENDENTS
# ------------------------------------------------------------------------------
# - ./.github/actions/ps-task/ps-run
#
# PURPOSE
# ------------------------------------------------------------------------------
# Emit a canonical JSON task report using environment variables.
#
# SECURITY TIERING
# ------------------------------------------------------------------------------
# Level 1 — High (canonical telemetry surface for task execution)
#
# AUDIT LOG
# ------------------------------------------------------------------------------
# Emits a deterministic JSON payload with a schema version for audit pipelines.
#
# ==============================================================================

import json
import os


def main() -> None:
    report_path = os.environ.get("REPORT_PATH")
    if not report_path:
        raise SystemExit("REPORT_PATH not set")

    schema_version = os.environ.get("PS_REPORT_SCHEMA_VERSION", "1.1.0")
    payload = {
        "schema_version": schema_version,
        "id": os.environ.get("TASK_ID", ""),
        "title": os.environ.get("TASK_TITLE", ""),
        "description": os.environ.get("TASK_DESC", ""),
        "status": os.environ.get("TASK_STATUS", ""),
        "exit_code": int(os.environ.get("TASK_EXIT_CODE", "0")),
        "duration_ms": int(os.environ.get("TASK_DURATION_MS", "0")),
        "log_path": os.environ.get("TASK_LOG_PATH", ""),
        "report_path": os.environ.get("TASK_REPORT_PATH", ""),
        "script": os.environ.get("TASK_SCRIPT", ""),
        "working_directory": os.environ.get("TASK_WORKDIR", ""),
    }

    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()
