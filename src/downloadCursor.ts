import {
	FileSystem,
	HttpClient,
	HttpClientResponse,
	type Error as PlatformError,
} from "@effect/platform";
import { Effect, Schedule, Stream } from "effect";

import { CliUI } from "./CliUI";
import { getCurrentCursorVersion } from "./getCurrentCursorVersion";
import { HOME_DIRECTORY as HomeDirectoryEffect } from "./utils/consts";
import { OperationCancelledError } from "./utils/errors";
import { CursorDownloadObject } from "./utils/schemas";

export const TEMP_DIR_NAME = ".cache/cursor-installer";

export const downloadCursor = Effect.gen(function* () {
	const HOME_DIRECTORY = yield* HomeDirectoryEffect;
	const httpClient = (yield* HttpClient.HttpClient).pipe(
		HttpClient.filterStatusOk,
	);
	const fs = yield* FileSystem.FileSystem;
	const ui = yield* CliUI;

	const tempDir = `${HOME_DIRECTORY}/${TEMP_DIR_NAME}`;
	const tempAppImage = `${tempDir}/cursor.appimage`;

	const downloadUrlSpinner = ui.spinner("dots");

	downloadUrlSpinner.start("Checking for new version of Cursor...");

	const { downloadUrl, newVersion } = yield* Effect.gen(function* () {
		const downloadUrlResponse = yield* Effect.retry(
			httpClient
				.get(
					"https://www.cursor.com/api/download?platform=linux-x64&releaseTrack=stable",
				)
				.pipe(
					Effect.tapError(() =>
						Effect.sync(() => downloadUrlSpinner.message("Retrying...")),
					),
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

		return { downloadUrl, newVersion };
	}).pipe(
		Effect.tapErrorCause(() =>
			Effect.sync(() => downloadUrlSpinner.stop("Failed to check version")),
		),
	);

	// Only swallow file-not-found errors (first install); let others propagate
	const currentVersion = yield* getCurrentCursorVersion.pipe(
		Effect.catchIf(
			(error): error is PlatformError.SystemError =>
				error._tag === "SystemError" && error.reason === "NotFound",
			() => Effect.succeed(undefined),
		),
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

	yield* fs.makeDirectory(tempDir, { recursive: true });

	const downloadAppimageSpinner = ui.spinner("timer");

	downloadAppimageSpinner.start("Downloading Cursor...");

	yield* Effect.gen(function* () {
		const appimageResponse = yield* Effect.retry(
			httpClient
				.get(downloadUrl)
				.pipe(
					Effect.tapError(() =>
						Effect.sync(() =>
							downloadAppimageSpinner.message("Retrying download..."),
						),
					),
				),
			{
				times: 3,
				schedule: Schedule.exponential(1000),
			},
		);

		const appimageStream = appimageResponse.stream;

		let currentLength = 0;

		const contentLength = appimageResponse.headers["content-length"];
		const parsedContentLength = Number(contentLength);
		const hasValidContentLength =
			contentLength !== undefined && Number.isFinite(parsedContentLength);

		yield* Stream.run(
			appimageStream.pipe(
				Stream.tap((chunk) => {
					currentLength += chunk.byteLength;

					if (hasValidContentLength) {
						const percentage = `${(
							(currentLength / parsedContentLength) * 100
						).toFixed(0)}%`;

						return Effect.succeed(downloadAppimageSpinner.message(percentage));
					}

					const megabytes = `${(currentLength / 1024 / 1024).toFixed(1)} MB`;

					return Effect.succeed(downloadAppimageSpinner.message(megabytes));
				}),
			),
			fs.sink(tempAppImage),
		);
	}).pipe(
		Effect.tapErrorCause(() =>
			Effect.sync(() => downloadAppimageSpinner.stop("Download failed")),
		),
	);

	downloadAppimageSpinner.stop("Downloaded Cursor");

	return newVersion;
});
