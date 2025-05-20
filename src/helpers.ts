import { Effect, Schedule, Stream } from "effect";
import { HttpClient, HttpClientResponse, FileSystem } from "@effect/platform";
import { spinner, log, confirm, isCancel } from "@clack/prompts";

import { CursorDownloadObject } from "./schemas";
import { cursorIcon, HOME_DIRECTORY, SHELL } from "./consts";
import {
	HomeDirectoryNotFoundError,
	OperationCancelledError,
	ShellConfigFileNotFoundError,
	ShellNotFoundError,
} from "./errors";

export const installCursor = Effect.gen(function* () {
	if (!HOME_DIRECTORY) {
		return yield* Effect.fail(new HomeDirectoryNotFoundError());
	}

	const fs = yield* FileSystem.FileSystem;

	const version = yield* downloadCursor;

	log.step(`Installing Cursor ${version}...`);

	// Add execute permissions
	yield* fs.chmod("/tmp/cursor.appimage", 0o775);

	// Backup existing cursor appimage if it exists
	if (yield* fs.exists(`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`)) {
		yield* fs.copy(
			`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`,
			`${HOME_DIRECTORY}/bin/cursor/cursor-pre-install-backup.appimage`,
		);

		log.info(
			`Current cursor.appimage backed up as cursor.pre-${version}.backup.appimage`,
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
	const shouldAddAlias = yield* Effect.orElse(
		Effect.promise(() =>
			confirm({
				message: "Do you want to add a Cursor alias to your shell?",
			}),
		),
		() => Effect.succeed(false),
	);

	if (!shouldAddAlias || isCancel(shouldAddAlias)) {
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

	if (!shellConfigFile || !fs.exists(shellConfigFile)) {
		return yield* Effect.fail(new ShellConfigFileNotFoundError());
	}

	const shellConfigFileContent = yield* fs.readFileString(shellConfigFile);

	if (
		shellConfigFileContent.includes(
			`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`,
		)
	) {
		log.warn("Cursor alias already exists.");

		return;
	}

	if (SHELL.includes("bash")) {
		// Backup .bashrc
		yield* fs.copy(
			`${HOME_DIRECTORY}/.bashrc`,
			`${HOME_DIRECTORY}/.bashrc.pre-cursor-installer-${version}.backup`,
		);

		log.info(
			`Current .bashrc backed up as .bashrc.pre-cursor-installer-${version}.backup`,
		);

		// Add to end of .bashrc
		yield* fs.writeFileString(
			`${HOME_DIRECTORY}/.bashrc`,
			shellConfigFileContent.concat(
				`\n\n# Cursor\nalias cursor="${HOME_DIRECTORY}/bin/cursor/cursor.appimage"`,
			),
		);

		log.success("Cursor alias added. Make sure to restart your shell.");
	}

	if (SHELL.includes("zsh")) {
		// Backup .zshrc
		yield* fs.copy(
			`${HOME_DIRECTORY}/.zshrc`,
			`${HOME_DIRECTORY}/.zshrc.pre-cursor-installer-${version}.backup`,
		);

		log.info(
			`Current .zshrc backed up as .zshrc.pre-cursor-installer-${version}.backup`,
		);

		// Add to end of .zshrc
		yield* fs.writeFileString(
			`${HOME_DIRECTORY}/.zshrc`,
			shellConfigFileContent.concat(
				`\n\n# Cursor\nalias cursor="${HOME_DIRECTORY}/bin/cursor/cursor.appimage"`,
			),
		);

		log.success("Cursor alias added. Make sure to restart your shell.");
	}
});

const downloadCursor = Effect.gen(function* () {
	const httpCLient = yield* HttpClient.HttpClient;
	const fs = yield* FileSystem.FileSystem;

	const downloadUrlSpinner = spinner({ indicator: "dots" });

	downloadUrlSpinner.start("Checking for new version of Cursor...");

	const downloadUrlResponse = yield* Effect.retry(
		httpCLient.get(
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

	const isCursorInstalled = yield* fs.exists(`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`);

	if (isCursorInstalled && currentVersion && currentVersion === newVersion) {
		downloadUrlSpinner.stop(`Cursor is up to date: ${currentVersion}`);
	} else {
		downloadUrlSpinner.stop(`New version available: ${newVersion}`);
	}

	const shouldDownload = yield* Effect.orElse(
		Effect.promise(() =>
			confirm({
				message: "Do you want to install?",
			}),
		),
		() => Effect.fail(new OperationCancelledError()),
	);

	if (!shouldDownload || isCancel(shouldDownload)) {
		return yield* Effect.fail(new OperationCancelledError());
	}

	const appimageResponse = yield* httpCLient.get(downloadUrl);

	const appimageStream = appimageResponse.stream;

	let currentLength = 0;

	const contentLength = appimageResponse.headers["content-length"];

	const downloadAppimageSpinner = spinner({ indicator: "timer" });

	downloadAppimageSpinner.start("Downloading Cursor...");

	yield* Stream.run(
		appimageStream.pipe(
			Stream.tap((chunk) => {
				currentLength += chunk.byteLength;

				const percentage = `${(
					(currentLength / Number(contentLength as string)) * 100
				).toFixed(0)}%`;

				return Effect.succeed(downloadAppimageSpinner.message(percentage));
			}),
		),
		fs.sink("/tmp/cursor.appimage"),
	);

	downloadAppimageSpinner.stop("Downloaded Cursor");

	return newVersion;
});

const getCurrentCursorVersion = Effect.gen(function* () {
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
