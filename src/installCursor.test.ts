import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";

import { installCursor } from "./installCursor";
import {
	createTestCliUI,
	createTestFileSystem,
	createTestHttpClient,
} from "./test-helpers";

const HOME = process.env["HOME"] as string;
const SHELL = process.env["SHELL"] as string;

const shellConfigPath = SHELL.includes("bash")
	? `${HOME}/.bashrc`
	: `${HOME}/.zshrc`;

const tempAppImage = `${HOME}/.cache/cursor-installer/cursor.appimage`;

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

	test("creates target directories before writing files", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		const { layer: fsLayer, operations } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		const mkdirOps = operations.filter((op) => op.op === "makeDirectory");
		expect(mkdirOps).toContainEqual({
			op: "makeDirectory",
			path: `${HOME}/bin/cursor`,
		});
		expect(mkdirOps).toContainEqual({
			op: "makeDirectory",
			path: `${HOME}/.local/share/applications`,
		});

		// Directories must be created before any copy operation
		const firstMkdir = operations.findIndex((op) => op.op === "makeDirectory");
		const firstCopy = operations.findIndex((op) => op.op === "copy");
		expect(firstMkdir).toBeLessThan(firstCopy);
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

	test("warns but succeeds when shell config does not exist", async () => {
		const { layer: cliLayer, logs } = createTestCliUI({
			// First confirm: "install?" → yes, Second confirm: "add alias?" → yes
			confirmResponses: [true, true],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		// No .bashrc or .zshrc in the file system
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		// Should succeed — alias failure is non-fatal
		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		// Desktop entry should still be written
		const warnLog = logs.find((l) => l.level === "warn");
		expect(warnLog?.message).toContain("not found");
	});

	test("adds alias to shell config when confirmed", async () => {
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
		expect(updatedConfig).toContain("nohup");
		expect(updatedConfig).toContain("disown");
		expect(updatedConfig).toContain("cursor.appimage");

		// Backup was created
		const backupPath = `${shellConfigPath}.pre-cursor-installer-1.0.0.backup`;
		expect(files.has(backupPath)).toBe(true);
	});

	test("removes old binary before copying new one", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "2.0.0" });
		const { layer: fsLayer, operations } = createTestFileSystem({
			[`${HOME}/bin/cursor/cursor.appimage`]: "old-appimage-content",
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		// Find the remove and copy operations for the appimage path
		const appImagePath = `${HOME}/bin/cursor/cursor.appimage`;
		const removeOp = operations.findIndex(
			(op) => op.op === "remove" && op.path === appImagePath,
		);
		const copyOp = operations.findIndex(
			(op) =>
				op.op === "copy" &&
				op.path === appImagePath &&
				op.from === tempAppImage,
		);

		expect(removeOp).toBeGreaterThanOrEqual(0);
		expect(copyOp).toBeGreaterThanOrEqual(0);
		// Remove must happen before copy
		expect(removeOp).toBeLessThan(copyOp);
	});

	test("restores backup and fails when copy fails", async () => {
		const appImagePath = `${HOME}/bin/cursor/cursor.appimage`;
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "2.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem(
			{
				[appImagePath]: "old-appimage-content",
			},
			{ failCopyFrom: tempAppImage },
		);

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		// Should fail with InstallationFailedError
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("InstallationFailedError");
		}

		// Backup should have been restored to the original path
		expect(files.get(appImagePath)).toBe("old-appimage-content");

		// Desktop entry should NOT have been written
		expect(files.has(`${HOME}/.local/share/applications/cursor.desktop`)).toBe(
			false,
		);
	});

	test("logs restoration failure when both copy and restore fail", async () => {
		const appImagePath = `${HOME}/bin/cursor/cursor.appimage`;
		const backupPath = `${HOME}/bin/cursor/cursor-pre-2.0.0-backup.appimage`;
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "2.0.0" });
		// Both the temp→app copy AND the backup→app restore will fail
		const { layer: fsLayer } = createTestFileSystem(
			{
				[appImagePath]: "old-appimage-content",
			},
			{ failCopyFrom: [tempAppImage, backupPath] },
		);

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("InstallationFailedError");
		}

		// Should mention restoration failed
		const restorationFailLog = logs.find(
			(l) =>
				l.level === "error" && l.message.includes("restoration also failed"),
		);
		expect(restorationFailLog).toBeDefined();

		// Should NOT say "previous version restored" — that would be a lie
		const restoredLog = logs.find(
			(l) =>
				l.level === "error" && l.message.includes("previous version restored"),
		);
		expect(restoredLog).toBeUndefined();
	});

	test("replaces old-format alias with nohup/disown format", async () => {
		const oldAlias = `alias cursor="${HOME}/bin/cursor/cursor.appimage"`;
		const existingConfig = `# config\n${oldAlias}\n`;
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, true],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem({
			[shellConfigPath]: existingConfig,
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		const updatedConfig = files.get(shellConfigPath);
		// Old alias should be gone
		expect(updatedConfig).not.toContain(oldAlias);
		// New alias should be present
		expect(updatedConfig).toContain("nohup");
		expect(updatedConfig).toContain("disown");

		// Should log that alias was updated
		const successLog = logs.find((l) => l.level === "success");
		expect(successLog?.message).toContain("alias");
	});

	test("fails with InstallationFailedError on fresh install copy failure", async () => {
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, false],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		// No existing appimage — fresh install
		const { layer: fsLayer } = createTestFileSystem(
			{},
			{ failCopyFrom: tempAppImage },
		);

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			installCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("InstallationFailedError");
		}

		// No backup restoration attempted (none existed)
		const errorLog = logs.find((l) => l.level === "error");
		expect(errorLog?.message).toContain("Installation failed");
		expect(errorLog?.message).not.toContain("restored");
	});

	test("skips alias when new-format alias already exists", async () => {
		const newAlias = `alias cursor='nohup ${HOME}/bin/cursor/cursor.appimage > /dev/null 2>&1 & disown'`;
		const existingConfig = `# config\n${newAlias}\n`;
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [true, true],
		});
		const httpLayer = createTestHttpClient({ version: "1.0.0" });
		const { layer: fsLayer, files } = createTestFileSystem({
			[shellConfigPath]: existingConfig,
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		await Effect.runPromise(installCursor.pipe(Effect.provide(testLayer)));

		// Config unchanged — new-format alias already present
		expect(files.get(shellConfigPath)).toBe(existingConfig);

		// Warning was logged
		const warnLog = logs.find((l) => l.level === "warn");
		expect(warnLog?.message).toContain("already exists");
	});
});
