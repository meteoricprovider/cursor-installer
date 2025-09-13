import { confirm, isCancel, spinner } from "@clack/prompts";
import { FileSystem, HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Schedule, Stream } from "effect";

import { getCurrentCursorVersion } from "./getCurrentCursorVersion";
import { HOME_DIRECTORY } from "./utils/consts";
import { OperationCancelledError } from "./utils/errors";
import { CursorDownloadObject } from "./utils/schemas";

export const downloadCursor = Effect.gen(function* () {
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

	const isCursorInstalled = yield* fs.exists(
		`${HOME_DIRECTORY}/bin/cursor/cursor.appimage`,
	);

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
