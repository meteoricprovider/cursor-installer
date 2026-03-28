import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

import { HOME_DIRECTORY as HomeDirectoryEffect } from "./utils/consts";

export const getCurrentCursorVersion = Effect.gen(function* () {
	const HOME_DIRECTORY = yield* HomeDirectoryEffect;
	const fs = yield* FileSystem.FileSystem;

	const desktopFile = yield* fs.readFileString(
		`${HOME_DIRECTORY}/.local/share/applications/cursor.desktop`,
	);

	const desktopFileLines = desktopFile.split("\n");

	const metaIndex = desktopFileLines.findIndex(
		(line) => line.trim() === "[Meta]",
	);

	const versionLine =
		metaIndex >= 0
			? desktopFileLines
					.slice(metaIndex)
					.find((line) => line.startsWith("Version="))
			: undefined;

	const currentVersion = versionLine?.split("=")[1];

	return currentVersion;
});
