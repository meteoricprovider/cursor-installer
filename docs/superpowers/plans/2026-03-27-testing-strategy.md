# Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TDD test suite using `bun:test` and Effect test layers, fixing 3 known bugs along the way.

**Architecture:** Mock at system boundaries using Effect's `Layer` system. Create a `CliUI` service to abstract `@clack/prompts` so the entire install pipeline is testable without real I/O. Use `FileSystem.layerNoop` for filesystem mocking, `HttpClient.make` for HTTP mocking. Integration-first testing with unit tests where branching is dense.

**Tech Stack:** `bun:test`, `effect`, `@effect/platform`

---

## Known Bugs to Fix via TDD

1. **`installCursor.ts:92`** — `fs.exists(shellConfigFile)` is not yielded. It's an Effect, not a boolean. The existence check is dead code.
2. **`installCursor.ts:35`** — Backup log says `cursor.pre-${version}.backup.appimage` but actual file is `cursor-pre-install-backup.appimage`.
3. **`downloadCursor.ts:78`** — `Number(contentLength)` produces `NaN` when `content-length` header is missing, showing `NaN%` in the spinner.

---

## File Structure

**New files:**

| File | Responsibility |
|------|---------------|
| `src/CliUI.ts` | CliUI Effect service definition + live layer |
| `src/test-helpers.ts` | Shared test layers: mock FS, mock HTTP, mock CliUI |
| `src/getCurrentCursorVersion.test.ts` | Unit tests for version parsing |
| `src/downloadCursor.test.ts` | Tests for download flow + NaN bug fix |
| `src/installCursor.test.ts` | Integration tests + fs.exists/log bugs |

**Modified files:**

| File | Change |
|------|--------|
| `package.json` | Add `"test"` script |
| `src/main.ts` | Provide `CliUILive` layer |
| `src/downloadCursor.ts` | Use CliUI service, fix content-length NaN |
| `src/installCursor.ts` | Use CliUI service, fix unyielded fs.exists, fix log message |

---

## Task 1: Setup bun:test

**Files:**
- Modify: `package.json`
- Create: `src/smoke.test.ts`

- [ ] **Step 1: Add test script to package.json**

Add `"test"` to the scripts object:

```json
"scripts": {
    "format": "biome format --write ./src",
    "lint": "biome lint ./src",
    "lint:check": "biome check ./src",
    "dev": "bun run ./src/main.ts",
    "test": "bun test"
}
```

- [ ] **Step 2: Create a smoke test to verify bun:test works**

```ts
// src/smoke.test.ts
import { describe, expect, test } from "bun:test";

describe("smoke", () => {
	test("bun:test works", () => {
		expect(1 + 1).toBe(2);
	});
});
```

- [ ] **Step 3: Run the test**

Run: `bun test`
Expected: 1 test passes.

- [ ] **Step 4: Delete smoke test and commit**

Delete `src/smoke.test.ts` (it was only to validate the runner).

```bash
git add package.json
git commit -m "chore: add bun test script"
```

---

## Task 2: TDD getCurrentCursorVersion

**Files:**
- Create: `src/getCurrentCursorVersion.test.ts`
- Read: `src/getCurrentCursorVersion.ts`

This module has one dependency (`FileSystem`) and no CliUI usage, making it the simplest starting point.

- [ ] **Step 1: Write failing test — parses version from valid .desktop file**

```ts
// src/getCurrentCursorVersion.test.ts
import { describe, expect, test } from "bun:test";
import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";

import { getCurrentCursorVersion } from "./getCurrentCursorVersion";

const MOCK_DESKTOP_FILE = `[Desktop Entry]
Name=Cursor
Comment=Better than VSCode
Exec=/home/testuser/bin/cursor/cursor.appimage %F
Icon=/home/testuser/bin/cursor/cursor.png
Type=Application
Categories=TextEditor;Development;IDE;
MimeType=application/x-code-workspace;
Keywords=cursor;

[Meta]
Version=0.48.9
`;

describe("getCurrentCursorVersion", () => {
	test("parses version from valid .desktop file", async () => {
		const TestFs = FileSystem.layerNoop({
			readFileString: () => Effect.succeed(MOCK_DESKTOP_FILE),
		});

		const result = await Effect.runPromise(
			getCurrentCursorVersion.pipe(Effect.provide(TestFs)),
		);

		expect(result).toBe("0.48.9");
	});
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test src/getCurrentCursorVersion.test.ts`
Expected: PASS — the code already handles this case correctly. If `FileSystem.layerNoop` API differs from expected, fix imports/usage based on compiler errors.

- [ ] **Step 3: Write test — returns undefined when Version= line is missing**

Add to the same describe block:

```ts
	test("returns undefined when Version= line is missing", async () => {
		const desktopFileWithoutVersion = `[Desktop Entry]
Name=Cursor
Type=Application
`;

		const TestFs = FileSystem.layerNoop({
			readFileString: () => Effect.succeed(desktopFileWithoutVersion),
		});

		const result = await Effect.runPromise(
			getCurrentCursorVersion.pipe(Effect.provide(TestFs)),
		);

		expect(result).toBeUndefined();
	});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/getCurrentCursorVersion.test.ts`
Expected: PASS — the optional chaining `versionLine?.split("=")[1]` handles this.

- [ ] **Step 5: Write test — fails when .desktop file does not exist**

The default `layerNoop` without overrides should fail on `readFileString`. The caller (`downloadCursor`) wraps this in `Effect.orElse`, but we test the raw effect here:

```ts
	test("fails when .desktop file does not exist", async () => {
		const TestFs = FileSystem.layerNoop();

		const result = await Effect.runPromise(
			getCurrentCursorVersion.pipe(
				Effect.provide(TestFs),
				Effect.either,
			),
		);

		expect(result._tag).toBe("Left");
	});
```

- [ ] **Step 6: Run all tests and commit**

Run: `bun test src/getCurrentCursorVersion.test.ts`
Expected: All 3 tests pass.

```bash
git add src/getCurrentCursorVersion.test.ts
git commit -m "test: add getCurrentCursorVersion tests"
```

---

## Task 3: Create CliUI Service and Refactor

**Files:**
- Create: `src/CliUI.ts`
- Modify: `src/downloadCursor.ts`
- Modify: `src/installCursor.ts`
- Modify: `src/main.ts`

The business logic currently calls `@clack/prompts` directly, making it untestable without module mocking. Extract a `CliUI` Effect service so tests can provide a mock layer.

- [ ] **Step 1: Create the CliUI service definition and live layer**

```ts
// src/CliUI.ts
import {
	confirm as clackConfirm,
	intro as clackIntro,
	isCancel,
	log,
	spinner,
} from "@clack/prompts";
import { Context, Effect, Layer } from "effect";

export interface Spinner {
	start(msg: string): void;
	stop(msg: string): void;
	message(msg: string): void;
}

export class CliUI extends Context.Tag("CliUI")<
	CliUI,
	{
		readonly intro: (msg: string) => void;
		readonly confirm: (msg: string) => Effect.Effect<boolean>;
		readonly spinner: (indicator: "dots" | "timer") => Spinner;
		readonly log: {
			readonly success: (msg: string) => void;
			readonly error: (msg: string) => void;
			readonly step: (msg: string) => void;
			readonly info: (msg: string) => void;
			readonly warn: (msg: string) => void;
		};
	}
>() {}

export const CliUILive = Layer.succeed(CliUI, {
	intro: clackIntro,
	confirm: (msg: string) =>
		Effect.promise(() => clackConfirm({ message: msg })).pipe(
			Effect.map((value) => (isCancel(value) ? false : value)),
			Effect.orElse(() => Effect.succeed(false)),
		),
	spinner: (indicator) => spinner({ indicator }),
	log,
});
```

- [ ] **Step 2: Refactor downloadCursor.ts to use CliUI**

Replace the full file content with:

```ts
// src/downloadCursor.ts
import { FileSystem, HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Schedule, Stream } from "effect";

import { CliUI } from "./CliUI";
import { getCurrentCursorVersion } from "./getCurrentCursorVersion";
import { HOME_DIRECTORY } from "./utils/consts";
import { OperationCancelledError } from "./utils/errors";
import { CursorDownloadObject } from "./utils/schemas";

export const downloadCursor = Effect.gen(function* () {
	const httpClient = yield* HttpClient.HttpClient;
	const fs = yield* FileSystem.FileSystem;
	const ui = yield* CliUI;

	const downloadUrlSpinner = ui.spinner("dots");

	downloadUrlSpinner.start("Checking for new version of Cursor...");

	const downloadUrlResponse = yield* Effect.retry(
		httpClient.get(
			"https://www.cursor.com/api/download?platform=linux-x64&releaseTrack=stable",
		),
		{
			times: 3,
			schedule: Schedule.exponential(1000),
		},
	);

	const { downloadUrl, version: newVersion } =
		yield* HttpClientResponse.schemaBodyJson(CursorDownloadObject)(
			downloadUrlResponse,
		);

	const currentVersion = yield* Effect.orElse(getCurrentCursorVersion, () =>
		Effect.succeed(undefined),
	);

	const isCursorInstalled = yield* fs.exists(
		`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`,
	);

	if (isCursorInstalled && currentVersion && currentVersion === newVersion) {
		downloadUrlSpinner.stop(`Cursor is up to date: ${currentVersion}`);
	} else {
		downloadUrlSpinner.stop(`New version available: ${newVersion}`);
	}

	const shouldDownload = yield* ui.confirm("Do you want to install?");

	if (!shouldDownload) {
		return yield* Effect.fail(new OperationCancelledError());
	}

	const appimageResponse = yield* httpClient.get(downloadUrl);

	const appimageStream = appimageResponse.stream;

	let currentLength = 0;

	const contentLength = appimageResponse.headers["content-length"];

	const downloadAppimageSpinner = ui.spinner("timer");

	downloadAppimageSpinner.start("Downloading Cursor...");

	yield* Stream.run(
		appimageStream.pipe(
			Stream.tap((chunk) => {
				currentLength += chunk.byteLength;

				if (contentLength) {
					const percentage = `${(
						(currentLength / Number(contentLength)) *
						100
					).toFixed(0)}%`;
					return Effect.succeed(
						downloadAppimageSpinner.message(percentage),
					);
				}

				const megabytes = `${(currentLength / 1024 / 1024).toFixed(1)} MB`;
				return Effect.succeed(
					downloadAppimageSpinner.message(megabytes),
				);
			}),
		),
		fs.sink("/tmp/cursor.appimage"),
	);

	downloadAppimageSpinner.stop("Downloaded Cursor");

	return newVersion;
});
```

Key changes:
- Replaced direct `@clack/prompts` imports with `CliUI` service
- Fixed typo: `httpCLient` → `httpClient`
- **Bug fix:** Added `if (contentLength)` guard to prevent `NaN%` when `content-length` header is missing. Falls back to showing downloaded MB.
- Simplified confirm flow: `ui.confirm()` returns `boolean` directly (cancel → `false`)

- [ ] **Step 3: Refactor installCursor.ts to use CliUI**

Replace the full file content with:

```ts
// src/installCursor.ts
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

import { CliUI } from "./CliUI";
import { downloadCursor } from "./downloadCursor";
import { cursorIcon, HOME_DIRECTORY, SHELL } from "./utils/consts";
import {
	HomeDirectoryNotFoundError,
	ShellConfigFileNotFoundError,
	ShellNotFoundError,
} from "./utils/errors";

export const installCursor = Effect.gen(function* () {
	if (!HOME_DIRECTORY) {
		return yield* Effect.fail(new HomeDirectoryNotFoundError());
	}

	const fs = yield* FileSystem.FileSystem;
	const ui = yield* CliUI;

	const version = yield* downloadCursor;

	ui.log.step(`Installing Cursor ${version}...`);

	// Add execute permissions
	yield* fs.chmod("/tmp/cursor.appimage", 0o775);

	// Backup existing cursor appimage if it exists
	if (yield* fs.exists(`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`)) {
		yield* fs.copy(
			`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`,
			`${HOME_DIRECTORY}/bin/cursor/cursor-pre-${version}-backup.appimage`,
		);

		ui.log.info(
			`Current cursor.appimage backed up as cursor-pre-${version}-backup.appimage`,
		);
	}

	// Move file to bin
	yield* fs.copy(
		"/tmp/cursor.appimage",
		`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`,
	);

	yield* fs.remove("/tmp/cursor.appimage");

	yield* fs.writeFile(`${HOME_DIRECTORY}/bin/cursor/cursor.png`, cursorIcon);

	// Create desktop entry
	yield* fs.writeFileString(
		`${HOME_DIRECTORY}/.local/share/applications/cursor.desktop`,
		`[Desktop Entry]
Name=Cursor
Comment=Better than VSCode
Exec=${HOME_DIRECTORY}/bin/cursor/cursor.appimage %F
Icon=${HOME_DIRECTORY}/bin/cursor/cursor.png
Type=Application
Categories=TextEditor;Development;IDE;
MimeType=application/x-code-workspace;
Keywords=cursor;

[Meta]
Version=${version}
`,
	);

	// Add alias to shell config file
	const shouldAddAlias = yield* ui.confirm(
		"Do you want to add a Cursor alias to your shell?",
	);

	if (!shouldAddAlias) {
		return;
	}

	if (!SHELL) {
		return yield* Effect.fail(new ShellNotFoundError());
	}

	// Only check for bash and zsh
	const shellConfigFile = SHELL.includes("bash")
		? `${HOME_DIRECTORY}/.bashrc`
		: SHELL.includes("zsh")
			? `${HOME_DIRECTORY}/.zshrc`
			: undefined;

	if (!shellConfigFile || !(yield* fs.exists(shellConfigFile))) {
		return yield* Effect.fail(new ShellConfigFileNotFoundError());
	}

	const shellConfigFileContent = yield* fs.readFileString(shellConfigFile);

	if (
		shellConfigFileContent.includes(
			`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`,
		)
	) {
		ui.log.warn("Cursor alias already exists.");

		return;
	}

	// Backup shell config
	yield* fs.copy(
		shellConfigFile,
		`${shellConfigFile}.pre-cursor-installer-${version}.backup`,
	);

	ui.log.info(
		`Current ${shellConfigFile.split("/").pop()} backed up as ${shellConfigFile.split("/").pop()}.pre-cursor-installer-${version}.backup`,
	);

	// Add alias to shell config
	yield* fs.writeFileString(
		shellConfigFile,
		shellConfigFileContent.concat(
			`\n\n# Cursor\nalias cursor="${HOME_DIRECTORY}/bin/cursor/cursor.appimage"`,
		),
	);

	ui.log.success("Cursor alias added. Make sure to restart your shell.");
});
```

Key changes:
- Replaced direct `@clack/prompts` imports with `CliUI` service
- **Bug fix:** `!fs.exists(shellConfigFile)` → `!(yield* fs.exists(shellConfigFile))` — the Effect is now properly yielded
- **Bug fix:** Backup filename now includes version: `cursor-pre-${version}-backup.appimage` — matches the log message
- Deduplicated bash/zsh alias logic into one code path using `shellConfigFile`

- [ ] **Step 4: Update main.ts to provide CliUILive layer**

```ts
// src/main.ts
#!/usr/bin/env bun

import { FetchHttpClient } from "@effect/platform";
import { BunFileSystem, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

import { CliUI, CliUILive } from "./CliUI";
import { installCursor } from "./installCursor";

const main = Effect.gen(function* () {
	const ui = yield* CliUI;
	ui.intro("Cursor Installer");

	yield* installCursor;

	ui.log.success("Cursor installed successfully!");
});

BunRuntime.runMain(
	main.pipe(
		Effect.provide(FetchHttpClient.layer),
		Effect.provide(BunFileSystem.layer),
		Effect.provide(CliUILive),
		Effect.catchAll((error) =>
			Effect.gen(function* () {
				const ui = yield* CliUI;
				ui.log.error(error.message);
			}).pipe(Effect.provide(CliUILive)),
		),
	),
);
```

- [ ] **Step 5: Verify the app still runs**

Run: `bun run dev`
Expected: App starts normally, shows "Cursor Installer" intro. (It will fail on HTTP or file operations on non-Linux, but the CliUI plumbing should work.)

- [ ] **Step 6: Run existing tests still pass**

Run: `bun test`
Expected: The getCurrentCursorVersion tests from Task 2 still pass (they don't depend on CliUI).

- [ ] **Step 7: Commit**

```bash
git add src/CliUI.ts src/downloadCursor.ts src/installCursor.ts src/main.ts
git commit -m "refactor: extract CliUI service from @clack/prompts

Fixes three bugs:
- fs.exists() now properly yielded in shell config check
- Backup filename includes version, matching log message
- content-length NaN guard added for chunked downloads"
```

---

## Task 4: Create Test Helpers

**Files:**
- Create: `src/test-helpers.ts`

Shared factories for test layers used across downloadCursor and installCursor tests.

- [ ] **Step 1: Create test helpers file**

```ts
// src/test-helpers.ts
import { FileSystem, HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Layer, Sink } from "effect";

import { type Spinner, CliUI } from "./CliUI";

// --- Mock CliUI ---

export const createTestCliUI = (options?: {
	confirmResponses?: boolean[];
}) => {
	let confirmIndex = 0;
	const logs: Array<{ level: string; message: string }> = [];

	const noopSpinner: Spinner = {
		start: () => {},
		stop: () => {},
		message: () => {},
	};

	const layer = Layer.succeed(CliUI, {
		intro: () => {},
		confirm: () => {
			const response =
				options?.confirmResponses?.[confirmIndex] ?? true;
			confirmIndex++;
			return Effect.succeed(response);
		},
		spinner: () => noopSpinner,
		log: {
			success: (msg: string) => {
				logs.push({ level: "success", message: msg });
			},
			error: (msg: string) => {
				logs.push({ level: "error", message: msg });
			},
			step: (msg: string) => {
				logs.push({ level: "step", message: msg });
			},
			info: (msg: string) => {
				logs.push({ level: "info", message: msg });
			},
			warn: (msg: string) => {
				logs.push({ level: "warn", message: msg });
			},
		},
	});

	return { layer, logs };
};

// --- Mock HttpClient ---

export const createTestHttpClient = (options?: {
	version?: string;
	downloadUrl?: string;
	appimageBody?: Uint8Array;
	appimageContentLength?: string | null;
}) => {
	const version = options?.version ?? "1.0.0";
	const downloadUrl =
		options?.downloadUrl ?? "https://download.example.com/cursor.appimage";
	const appimageBody = options?.appimageBody ?? new Uint8Array([1, 2, 3]);

	const apiResponseBody = JSON.stringify({
		version,
		downloadUrl,
		rehUrl: "https://reh.example.com",
	});

	return Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((req) => {
			if (req.url.includes("cursor.com/api/download")) {
				return Effect.succeed(
					HttpClientResponse.fromWeb(
						req,
						new Response(apiResponseBody),
					),
				);
			}

			const headers: Record<string, string> = {};
			if (options?.appimageContentLength !== null) {
				headers["content-length"] =
					options?.appimageContentLength ??
					String(appimageBody.length);
			}

			return Effect.succeed(
				HttpClientResponse.fromWeb(
					req,
					new Response(appimageBody, { headers }),
				),
			);
		}),
	);
};

// --- Mock FileSystem ---

export const createTestFileSystem = (
	initialFiles?: Record<string, string>,
) => {
	const files = new Map<string, string>(
		Object.entries(initialFiles ?? {}),
	);
	const binaryFiles = new Map<string, Uint8Array>();

	const layer = FileSystem.layerNoop({
		exists: (path) => Effect.succeed(files.has(path)),
		readFileString: (path) => {
			const content = files.get(path);
			if (content === undefined) {
				return Effect.fail(
					new (Error as any)({ message: `File not found: ${path}` }),
				);
			}
			return Effect.succeed(content);
		},
		writeFileString: (path, content) => {
			files.set(path, content as string);
			return Effect.void;
		},
		writeFile: (path, data) => {
			binaryFiles.set(path, data as Uint8Array);
			return Effect.void;
		},
		copy: (from, to) => {
			const content = files.get(from);
			if (content !== undefined) files.set(to, content);
			return Effect.void;
		},
		remove: (path) => {
			files.delete(path);
			return Effect.void;
		},
		chmod: () => Effect.void,
		sink: () => Sink.drain,
	});

	return { layer, files, binaryFiles };
};
```

**Note:** The exact types for `FileSystem.layerNoop` overrides may need adjustment based on what the API accepts. If `layerNoop` does not accept `sink`, use `Layer.succeed(FileSystem.FileSystem, { ... })` with the full interface instead. The TDD loop will catch this.

- [ ] **Step 2: Verify test helpers compile**

Run: `bunx tsc --noEmit src/test-helpers.ts`
Expected: No type errors. Fix any type mismatches (especially around `FileSystem.layerNoop` overrides or `Effect.void`).

- [ ] **Step 3: Commit**

```bash
git add src/test-helpers.ts
git commit -m "test: add shared test helpers for mock FS, HTTP, and CliUI"
```

---

## Task 5: TDD downloadCursor

**Files:**
- Create: `src/downloadCursor.test.ts`
- Modify: `src/downloadCursor.ts` (if bug fix wasn't applied in Task 3)

- [ ] **Step 1: Write test — happy path returns version after download**

```ts
// src/downloadCursor.test.ts
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";

import { downloadCursor } from "./downloadCursor";
import {
	createTestCliUI,
	createTestFileSystem,
	createTestHttpClient,
} from "./test-helpers";

describe("downloadCursor", () => {
	test("returns new version after successful download", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		const httpLayer = createTestHttpClient({ version: "1.2.0" });
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer)),
		);

		expect(result).toBe("1.2.0");
	});
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test src/downloadCursor.test.ts`
Expected: PASS.

- [ ] **Step 3: Write test — returns OperationCancelledError when user declines**

```ts
	test("fails with OperationCancelledError when user declines", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [false],
		});
		const httpLayer = createTestHttpClient();
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("OperationCancelledError");
		}
	});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/downloadCursor.test.ts`
Expected: PASS.

- [ ] **Step 5: Write test — handles missing content-length without NaN**

This test verifies the bug fix from Task 3. If the fix was applied, it passes. If not, write the fix now.

```ts
	test("handles missing content-length header without NaN", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		const httpLayer = createTestHttpClient({
			appimageContentLength: null,
			appimageBody: new Uint8Array(1024 * 1024),
		});
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		// The test passes if no NaN-related error occurs and the download completes
		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer)),
		);

		expect(result).toBeDefined();
	});
```

- [ ] **Step 6: Run test**

Run: `bun test src/downloadCursor.test.ts`
Expected: PASS (the NaN guard was added in Task 3 Step 2). If FAIL, apply the `if (contentLength)` guard from Task 3 Step 2 to `downloadCursor.ts`.

- [ ] **Step 7: Write test — shows "up to date" when versions match**

```ts
	test("still asks to install when version is up to date", async () => {
		const currentVersion = "1.0.0";
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true],
		});
		const httpLayer = createTestHttpClient({ version: currentVersion });
		const { layer: fsLayer } = createTestFileSystem({
			[`${process.env["HOME"]}/bin/cursor/cursor.appimage`]: "existing",
			[`${process.env["HOME"]}/.local/share/applications/cursor.desktop`]: `[Meta]\nVersion=${currentVersion}\n`,
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer)),
		);

		// Still returns the version (user confirmed install)
		expect(result).toBe(currentVersion);
	});
```

- [ ] **Step 8: Run all tests and commit**

Run: `bun test src/downloadCursor.test.ts`
Expected: All 4 tests pass.

```bash
git add src/downloadCursor.test.ts
git commit -m "test: add downloadCursor tests covering happy path, cancel, NaN fix, and up-to-date"
```

---

## Task 6: TDD installCursor

**Files:**
- Create: `src/installCursor.test.ts`
- Modify: `src/installCursor.ts` (if bug fixes weren't applied in Task 3)

This is the integration-level test. It exercises the full pipeline through mock layers.

- [ ] **Step 1: Write test — happy path installs and creates desktop entry**

```ts
// src/installCursor.test.ts
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";

import { installCursor } from "./installCursor";
import {
	createTestCliUI,
	createTestFileSystem,
	createTestHttpClient,
} from "./test-helpers";

const HOME = process.env["HOME"] as string;

describe("installCursor", () => {
	test("installs cursor and creates desktop entry", async () => {
		const { layer: cliLayer } = createTestCliUI({
			// First confirm: "install?" → yes, Second confirm: "add alias?" → no
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer)),
		);

		// Desktop entry was written
		const desktopEntry = files.get(
			`${HOME}/.local/share/applications/cursor.desktop`,
		);
		expect(desktopEntry).toBeDefined();
		expect(desktopEntry).toContain("Version=1.0.0");
		expect(desktopEntry).toContain("Name=Cursor");
		expect(desktopEntry).toContain(`Exec=${HOME}/bin/cursor/cursor.appimage`);
	});
});
```

- [ ] **Step 2: Run test**

Run: `bun test src/installCursor.test.ts`
Expected: PASS.

- [ ] **Step 3: Write test — backs up existing appimage with version in filename**

```ts
	test("backs up existing appimage with version in filename", async () => {
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "2.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem({
			[`${HOME}/bin/cursor/cursor.appimage`]: "old-appimage-content",
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer)),
		);

		// Backup was created with version in filename
		const backup = files.get(
			`${HOME}/bin/cursor/cursor-pre-2.0.0-backup.appimage`,
		);
		expect(backup).toBe("old-appimage-content");

		// Log message matches the actual backup filename
		const infoLog = logs.find((l) => l.level === "info");
		expect(infoLog?.message).toContain("cursor-pre-2.0.0-backup.appimage");
	});
```

- [ ] **Step 4: Run test**

Run: `bun test src/installCursor.test.ts`
Expected: PASS (bug fix applied in Task 3). If FAIL, the backup filename or log message doesn't match — apply the fix from Task 3 Step 3.

- [ ] **Step 5: Write test — properly checks shell config file exists (bug fix validation)**

This is the critical test for the unyielded `fs.exists` bug:

```ts
	test("fails with ShellConfigFileNotFoundError when shell config does not exist", async () => {
		const { layer: cliLayer } = createTestCliUI({
			// First confirm: "install?" → yes, Second confirm: "add alias?" → yes
			confirmResponses: [true, true],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		// No .bashrc or .zshrc in the file system
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("ShellConfigFileNotFoundError");
		}
	});
```

- [ ] **Step 6: Run test**

Run: `bun test src/installCursor.test.ts`
Expected: PASS (bug fix applied in Task 3 — `yield* fs.exists(shellConfigFile)` is now correctly yielded). If FAIL with a different error type (e.g., a raw FS read error instead of `ShellConfigFileNotFoundError`), the `fs.exists` yield fix wasn't applied — apply it from Task 3 Step 3.

- [ ] **Step 7: Write test — adds alias to shell config**

```ts
	test("adds alias to shell config when confirmed", async () => {
		const shellConfigPath = `${HOME}/.zshrc`;
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, true],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem({
			[shellConfigPath]: "# existing config\n",
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer)),
		);

		const updatedConfig = files.get(shellConfigPath);
		expect(updatedConfig).toContain("alias cursor=");
		expect(updatedConfig).toContain("cursor.appimage");

		// Backup was created
		const backupPath = `${shellConfigPath}.pre-cursor-installer-1.0.0.backup`;
		expect(files.has(backupPath)).toBe(true);
	});
```

- [ ] **Step 8: Run test**

Run: `bun test src/installCursor.test.ts`
Expected: PASS. This test depends on `process.env.SHELL` containing "zsh" (typical on macOS). If running in a different shell, the test may need adjustment.

- [ ] **Step 9: Write test — skips alias when it already exists**

```ts
	test("skips alias when it already exists in shell config", async () => {
		const shellConfigPath = `${HOME}/.zshrc`;
		const existingConfig = `# config\nalias cursor="${HOME}/bin/cursor/cursor.appimage"\n`;
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, true],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem({
			[shellConfigPath]: existingConfig,
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer)),
		);

		// Config unchanged — alias was already present
		expect(files.get(shellConfigPath)).toBe(existingConfig);

		// Warning was logged
		const warnLog = logs.find((l) => l.level === "warn");
		expect(warnLog?.message).toContain("already exists");
	});
```

- [ ] **Step 10: Run all installCursor tests**

Run: `bun test src/installCursor.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 11: Run full test suite**

Run: `bun test`
Expected: All tests across all files pass (getCurrentCursorVersion: 3, downloadCursor: 4, installCursor: 5 = 12 total).

- [ ] **Step 12: Commit**

```bash
git add src/installCursor.test.ts
git commit -m "test: add installCursor integration tests

Validates bug fixes:
- fs.exists is properly yielded for shell config check
- Backup filename includes version, matching log message
- Shell alias flow: add, skip when exists, config file missing"
```
