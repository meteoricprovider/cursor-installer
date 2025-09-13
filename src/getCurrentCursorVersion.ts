import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

import { HOME_DIRECTORY } from "./utils/consts";
import { HomeDirectoryNotFoundError } from "./utils/errors";

export const getCurrentCursorVersion = Effect.gen(function* () {
	if (!HOME_DIRECTORY) {
		return yield* Effect.fail(new HomeDirectoryNotFoundError());
	}

	const fs = yield* FileSystem.FileSystem;

	const desktopFile = yield* fs.readFileString(
		`${HOME_DIRECTORY}/.local/share/applications/cursor.desktop`,
	);

	const desktopFileLines = desktopFile.split("\n");

	const versionLine = desktopFileLines.find((line) =>
		line.startsWith("Version="),
	);

	const currentVersion = versionLine?.split("=")[1];

	return currentVersion;
});
