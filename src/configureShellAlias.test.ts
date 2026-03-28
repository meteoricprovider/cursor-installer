import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";

import { configureShellAlias } from "./configureShellAlias";
import { createTestCliUI, createTestFileSystem } from "./test-helpers";

const HOME = process.env["HOME"] as string;

describe("configureShellAlias", () => {
	test("does nothing when user declines alias prompt", async () => {
		const { layer: cliLayer, logs } = createTestCliUI({
			confirmResponses: [false],
		});
		const {
			layer: fsLayer,
			files,
			operations,
		} = createTestFileSystem({
			[`${HOME}/.bashrc`]: "# existing config\n",
		});

		const testLayer = Layer.mergeAll(cliLayer, fsLayer);

		await Effect.runPromise(
			configureShellAlias("1.0.0").pipe(Effect.provide(testLayer)),
		);

		// No backup created, no file writes, no operations beyond what existed
		const copyOps = operations.filter((op) => op.op === "copy");
		expect(copyOps).toHaveLength(0);

		// Config file unchanged
		expect(files.get(`${HOME}/.bashrc`)).toBe("# existing config\n");

		// No success/info logs about alias
		expect(logs.filter((l) => l.message.includes("alias"))).toHaveLength(0);
	});

	test("fails with UnsupportedShellError for fish shell", async () => {
		const originalShell = process.env["SHELL"];
		process.env["SHELL"] = "/usr/bin/fish";

		try {
			const { layer: cliLayer } = createTestCliUI({
				confirmResponses: [true],
			});
			const { layer: fsLayer } = createTestFileSystem();

			const testLayer = Layer.mergeAll(cliLayer, fsLayer);

			const result = await Effect.runPromise(
				configureShellAlias("1.0.0").pipe(
					Effect.provide(testLayer),
					Effect.either,
				),
			);

			expect(result._tag).toBe("Left");
			if (result._tag === "Left") {
				expect(result.left._tag).toBe("UnsupportedShellError");
				expect(result.left.message).toContain("fish");
				expect(result.left.message).toContain("not supported");
			}
		} finally {
			process.env["SHELL"] = originalShell;
		}
	});

	test("fails with ShellConfigFileNotFoundError when config file missing", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		// No shell config files in the filesystem
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, fsLayer);

		const result = await Effect.runPromise(
			configureShellAlias("1.0.0").pipe(
				Effect.provide(testLayer),
				Effect.either,
			),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("ShellConfigFileNotFoundError");
		}
	});
});
