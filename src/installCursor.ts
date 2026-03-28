import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

import { CliUI } from "./CliUI";
import { configureShellAlias } from "./configureShellAlias";
import { downloadCursor, TEMP_DIR_NAME } from "./downloadCursor";
import {
	cursorIcon,
	HOME_DIRECTORY as HomeDirectoryEffect,
} from "./utils/consts";
import { InstallationFailedError } from "./utils/errors";

export const installCursor = Effect.gen(function* () {
	const HOME_DIRECTORY = yield* HomeDirectoryEffect;
	const fs = yield* FileSystem.FileSystem;
	const ui = yield* CliUI;

	const version = yield* downloadCursor;

	const tempAppImage = `${HOME_DIRECTORY}/${TEMP_DIR_NAME}/cursor.appimage`;

	ui.log.step(`Installing Cursor ${version}...`);

	// Ensure target directories exist
	yield* fs.makeDirectory(`${HOME_DIRECTORY}/bin/cursor`, { recursive: true });
	yield* fs.makeDirectory(`${HOME_DIRECTORY}/.local/share/applications`, {
		recursive: true,
	});

	// Add execute permissions
	yield* fs.chmod(tempAppImage, 0o775);

	const appImagePath = `${HOME_DIRECTORY}/bin/cursor/cursor.appimage`;
	const backupPath = `${HOME_DIRECTORY}/bin/cursor/cursor-pre-${version}-backup.appimage`;

	// Backup existing cursor appimage if it exists
	if (yield* fs.exists(appImagePath)) {
		yield* fs.copy(appImagePath, backupPath);

		ui.log.info(
			`Current cursor.appimage backed up as cursor-pre-${version}-backup.appimage`,
		);
	}

	// Remove old binary before copying to ensure replacement
	if (yield* fs.exists(appImagePath)) {
		yield* fs.remove(appImagePath);
	}

	// Copy new binary — restore backup on failure
	yield* fs.copy(tempAppImage, appImagePath).pipe(
		Effect.catchAll((copyError) =>
			Effect.gen(function* () {
				if (yield* fs.exists(backupPath)) {
					const restored = yield* fs.copy(backupPath, appImagePath).pipe(
						Effect.as(true),
						Effect.catchAll(() => {
							ui.log.error(
								"Installation failed and backup restoration also failed. You may need to reinstall manually.",
							);
							return Effect.succeed(false);
						}),
					);
					if (restored) {
						ui.log.error("Installation failed, previous version restored.");
					}
				} else {
					ui.log.error(
						`Installation failed: ${copyError._tag === "SystemError" ? copyError.reason : "unknown error"}`,
					);
				}
				return yield* Effect.fail(new InstallationFailedError());
			}),
		),
	);

	yield* fs.remove(tempAppImage).pipe(Effect.ignore);

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

	yield* configureShellAlias(version).pipe(
		Effect.catchAll((error) => {
			ui.log.warn(error.message);
			return Effect.void;
		}),
	);
});
