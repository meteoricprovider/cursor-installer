# Effect & Testing Conventions

## Effect Patterns

Business logic uses Effect generators (`Effect.gen`), typed errors (`Data.TaggedError`), and platform services (`FileSystem`, `HttpClient`) accessed from Effect context.

The CLI UI is abstracted behind a `CliUI` service backed by `@clack/prompts`. The `--yes` / `-y` flag swaps `CliUIInteractive` for `CliUIAutoAccept` (auto-confirms all prompts).

## Testing

Tests use `bun:test` with Effect layers for dependency injection. See `src/test-helpers.ts` for mock factories (`createTestFileSystem`, `createTestHttpClient`, `createTestCliUI`). Tests swap in a mock `CliUI` layer to avoid interactive prompts.

## E2E

`bun run test:e2e` runs the real installer in a Docker container (`oven/bun:slim`), downloading from cursor.com. Requires Docker. Uses `--yes` flag for auto-accept.
