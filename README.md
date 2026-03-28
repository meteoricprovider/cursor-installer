# cursor-installer

[![npm](https://img.shields.io/npm/v/cursor-installer)](https://www.npmjs.com/package/cursor-installer)

Downloads and installs the latest [Cursor](https://cursor.com/) editor on Linux.

## Usage

```bash
npx cursor-installer@latest
```

Pass `--yes` (or `-y`) to skip all confirmation prompts:

```bash
npx cursor-installer@latest --yes
```

What it does:

- Checks your installed version and skips the download if it's current
- Downloads the latest AppImage if needed
- Sets file permissions
- Creates a `.desktop` entry
- Adds a `cursor` shell alias

## Requirements

- Linux
- Bun (^1.3.11)

## Effect & Testing Conventions

### Effect Patterns

Business logic uses Effect generators (`Effect.gen`), typed errors (`Data.TaggedError`), and platform services (`FileSystem`, `HttpClient`) accessed from Effect context.

The CLI UI is abstracted behind a `CliUI` service backed by `@clack/prompts`. The `--yes` / `-y` flag swaps `CliUIInteractive` for `CliUIAutoAccept` (auto-confirms all prompts).

### Testing

Tests use `bun:test` with Effect layers for dependency injection. See `src/test-helpers.ts` for mock factories (`createTestFileSystem`, `createTestHttpClient`, `createTestCliUI`). Tests swap in a mock `CliUI` layer to avoid interactive prompts.

### E2E

`bun run test:e2e` runs the real installer in a Docker container (`oven/bun:slim`), downloading from cursor.com. Requires Docker. Uses `--yes` flag for auto-accept.

## Built with

- [Bun](https://bun.sh/) + [TypeScript](https://www.typescriptlang.org/)
- [Effect](https://effect.website/)
- [Clack](https://github.com/bombshell-dev/clack)

## License

MIT
