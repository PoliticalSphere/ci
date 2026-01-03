# Script Helpers (Lib)

Shared Node.js modules used by executable scripts under `/tools/scripts`.

## Purpose

- Centralize common CLI helpers to avoid duplication.
- Keep script behavior deterministic and consistent across tools.

## Contents

- `cli.js`: argument parsing, path resolution, and report/summary output helpers.

## Usage

These modules are imported by scripts; they are **not** executable on their own.
