import { describe, expect, test } from "bun:test";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

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

	test("fails when .desktop file does not exist", async () => {
		const TestFs = FileSystem.layerNoop({});

		const result = await Effect.runPromise(
			getCurrentCursorVersion.pipe(
				Effect.provide(TestFs),
				Effect.either,
			),
		);

		expect(result._tag).toBe("Left");
	});
});
