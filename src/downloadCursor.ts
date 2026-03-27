import { FileSystem, HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Schedule, Stream } from "effect";

import { CliUI } from "./CliUI";
import { getCurrentCursorVersion } from "./getCurrentCursorVersion";
import { HOME_DIRECTORY as HomeDirectoryEffect } from "./utils/consts";
import { OperationCancelledError } from "./utils/errors";
import { CursorDownloadObject } from "./utils/schemas";

export const downloadCursor = Effect.gen(function* () {
	const HOME_DIRECTORY = yield* HomeDirectoryEffect;
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
						(currentLength / Number(contentLength)) * 100
					).toFixed(0)}%`;
					return Effect.succeed(downloadAppimageSpinner.message(percentage));
				}

				const megabytes = `${(currentLength / 1024 / 1024).toFixed(1)} MB`;
				return Effect.succeed(downloadAppimageSpinner.message(megabytes));
			}),
		),
		fs.sink("/tmp/cursor.appimage"),
	);

	downloadAppimageSpinner.stop("Downloaded Cursor");

	return newVersion;
});
