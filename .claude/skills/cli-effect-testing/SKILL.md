---
name: cli-effect-testing
description: Use when writing or reviewing tests for this Bun CLI project that uses Effect for dependency injection and bun:test as the test runner. Also use when encountering mock.module usage, vi.mock patterns, or manual Layer construction instead of the project's shared test helpers.
---

# Writing Tests for cursor-installer

## Overview

Test **observable outcomes** (return values, error types, file system side effects, log messages) by composing Effect Layers with the project's shared test helpers. Never use module mocking (`mock.module`, `vi.mock`, `jest.mock`) — Effect's dependency injection via Layers replaces all of that.

## When to Use

- Writing new test files for any module in `src/`
- Reviewing existing tests for convention violations
- NOT for non-Effect utility functions (test those with plain assertions)

## Test Infrastructure

**Framework:** `bun:test` — imports are `{ describe, expect, test }` from `"bun:test"`

**Run tests:** `bun test`

### Shared Test Helpers (`src/test-helpers.ts`)

Read this file before writing any test. It provides three factories:

| Helper | Mocks | Returns |
|--------|-------|---------|
| `createTestCliUI(options?)` | `CliUI` context (prompts, spinners, logging) | `{ layer, logs }` |
| `createTestHttpClient(options?)` | `HttpClient.HttpClient` (API + download responses) | `Layer` |
| `createTestFileSystem(initialFiles?)` | `FileSystem.FileSystem` (in-memory maps) | `{ layer, files, binaryFiles }` |

**Always use these helpers.** Do not construct mock Layers manually or create custom wrapper functions.

### For simple modules needing only FileSystem

Use `FileSystem.layerNoop()` directly — this is what the shared helper wraps:

```typescript
const TestFs = FileSystem.layerNoop({
  readFileString: () => Effect.succeed(mockContent),
});
```

`FileSystem.layerNoop({})` with no overrides provides default noop methods that fail on read operations — use this to test file-not-found behavior without constructing explicit errors:

```typescript
// Triggers a failure when the effect tries to read a file
const TestFs = FileSystem.layerNoop({});
```

## Core Pattern

Every test follows this structure:

```typescript
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { createTestCliUI, createTestFileSystem, createTestHttpClient } from "./test-helpers";

describe("moduleName", () => {
  test("describes observable outcome", async () => {
    // 1. Arrange: create layers
    const { layer: cliLayer, logs } = createTestCliUI({ confirmResponses: [true] });
    const httpLayer = createTestHttpClient({ version: "1.0.0" });
    const { layer: fsLayer, files } = createTestFileSystem();
    const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

    // 2. Act: run the Effect
    const result = await Effect.runPromise(
      myEffect.pipe(Effect.provide(testLayer)),
    );

    // 3. Assert: check return value, file state, or logs
    expect(result).toBe("1.0.0");
  });
});
```

## Error Testing Pattern

Use `Effect.either` — **never** `Effect.runPromiseExit`:

```typescript
test("fails with SpecificError when condition", async () => {
  const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

  const result = await Effect.runPromise(
    myEffect.pipe(Effect.provide(testLayer), Effect.either),
  );

  expect(result._tag).toBe("Left");
  if (result._tag === "Left") {
    expect(result.left._tag).toBe("OperationCancelledError");
  }
});
```

## Asserting Side Effects

**File system state** — check the `files` or `binaryFiles` maps after running:

```typescript
const { layer: fsLayer, files } = createTestFileSystem();
// ... run effect ...
const content = files.get("/path/to/file");
expect(content).toContain("expected text");
```

**Log messages** — check the `logs` array from `createTestCliUI`:

```typescript
const { layer: cliLayer, logs } = createTestCliUI();
// ... run effect ...
const warnLog = logs.find((l) => l.level === "warn");
expect(warnLog?.message).toContain("already exists");
```

**User confirmation flow** — control with `confirmResponses` array:

```typescript
const { layer: cliLayer } = createTestCliUI({
  confirmResponses: [true, false],  // first confirm: yes, second: no
});
```

## Conventions

| Don't | Do Instead |
|-------|------------|
| `mock.module(...)` or `vi.mock(...)` | Effect Layer composition via test helpers |
| `Layer.succeed(FileSystem.FileSystem, { ... } as any)` | `createTestFileSystem()` or `FileSystem.layerNoop()` |
| Custom wrapper functions (`runWithFs`, `makeTestLayer`) | Inline `Layer.mergeAll()` + `Effect.provide()` |
| `Effect.runPromiseExit` for error checks | `Effect.either` pattern |
| Assert on internal implementation details | Assert on return values, error `_tag`, file maps, logs |
| `import { mock } from "bun:test"` | No module mocking needed — Layers handle DI |
| Invent many edge-case tests | Focus on real behavior: happy path, user interactions, error cases |
| Dynamic `await import(...)` for Effect types | Static imports at top of file |
| Constructing `PlatformError.SystemError` manually | `FileSystem.layerNoop({})` (noop defaults fail on read) |

## What to Test

Focus on real user-facing behavior:

1. **Happy path** — function returns expected value
2. **User interaction flows** — confirm/decline via `confirmResponses`
3. **Error cases** — tagged errors from real failure conditions
4. **Side effects** — files written, logs emitted, backups created

Do NOT invent edge cases the code doesn't handle (e.g., malformed input formats the regex wouldn't encounter in practice).

## Common Mistakes

**Mocking modules instead of using Layers:**
The Effect architecture means all dependencies (FileSystem, HttpClient, CliUI) are injected via context. `mock.module` breaks this pattern and creates brittle, hard-to-maintain tests.

**Constructing FileSystem manually:**
Never spread `FileSystem.makeNoop()` and cast. Use `FileSystem.layerNoop({ ... })` which is the correct API.

**Over-testing:**
If the source function is 20 lines, 3-4 focused tests are sufficient. Don't write 9 tests to cover imaginary edge cases.
