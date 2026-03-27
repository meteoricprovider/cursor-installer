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

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		// Desktop entry was written
		const desktopEntry = files.get(
			`${HOME}/.local/share/applications/cursor.desktop`,
		);
		expect(desktopEntry).toBeDefined();
		expect(desktopEntry).toContain("Version=1.0.0");
		expect(desktopEntry).toContain("Name=Cursor");
		expect(desktopEntry).toContain(`Exec=${HOME}/bin/cursor/cursor.appimage`);
	});

	test("backs up existing appimage with version in filename", async () => {
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "2.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem({
			[`${HOME}/bin/cursor/cursor.appimage`]: "old-appimage-content",
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		// Backup was created with version in filename
		const backup = files.get(
			`${HOME}/bin/cursor/cursor-pre-2.0.0-backup.appimage`,
		);
		expect(backup).toBe("old-appimage-content");

		// Log message matches the actual backup filename
		const infoLog = logs.find((l) => l.level === "info");
		expect(infoLog?.message).toContain("cursor-pre-2.0.0-backup.appimage");
	});

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

	test("adds alias to shell config when confirmed", async () => {
		const shellConfigPath = `${HOME}/.zshrc`;
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true, true],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem({
			[shellConfigPath]: "# existing config\n",
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		const updatedConfig = files.get(shellConfigPath);
		expect(updatedConfig).toContain("alias cursor=");
		expect(updatedConfig).toContain("cursor.appimage");

		// Backup was created
		const backupPath = `${shellConfigPath}.pre-cursor-installer-1.0.0.backup`;
		expect(files.has(backupPath)).toBe(true);
	});

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

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		// Config unchanged — alias was already present
		expect(files.get(shellConfigPath)).toBe(existingConfig);

		// Warning was logged
		const warnLog = logs.find((l) => l.level === "warn");
		expect(warnLog?.message).toContain("already exists");
	});
});
