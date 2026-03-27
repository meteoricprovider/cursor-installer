# AGENTS.md

This file provides guidance to AI coding agents working in this repository.

## Project

CLI tool that downloads and installs the latest Cursor editor on Linux, distributed via `npx cursor-installer@latest`.

## Runtime & Package Manager

This project uses Bun (not npm). Dependencies are managed with `bun install` (auto-install is disabled).

## Commands

```bash
bun run dev          # Run the installer locally
bun run format       # Format with Biome
bun run lint         # Lint with Biome
bun run lint:check   # Lint + format check
```

No test suite exists.

## Key Context

- All business logic uses the [Effect](https://effect.website/) library — generators (`Effect.gen`), typed errors (`Data.TaggedError`), and platform services (`FileSystem`, `HttpClient`) accessed from Effect context.
- CLI UI uses `@clack/prompts` for spinners, confirmations, and log messages.
