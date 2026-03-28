# AGENTS.md

CLI tool that downloads and installs the latest Cursor editor on Linux, distributed via `npx cursor-installer@latest`.

## Stack

- **Runtime**: Bun (not npm). Run `bun install` to manage dependencies (auto-install is disabled).
- **Architecture**: All business logic uses [Effect](https://effect.website/) — generators, typed errors, and dependency injection via services/layers.
- **Linting/Formatting**: Biome.

## Commands

```bash
bun run dev          # Run the installer locally
bun run test         # Run unit/integration tests
bun run test:e2e     # Run E2E test in Docker (hits real cursor.com). Requires Docker.
bun run format       # Format with Biome
bun run lint         # Lint with Biome
bun run lint:check   # Lint + format check
bun run typecheck    # Type-check with tsgo
```

For Effect patterns and testing conventions, see [README.md](README.md#effect--testing-conventions).
