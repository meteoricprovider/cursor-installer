import { Effect, Schedule, Stream } from "effect";
import { HttpClient, HttpClientResponse, FileSystem } from "@effect/platform";
import { spinner, log, confirm, isCancel } from "@clack/prompts";

import { CursorDownloadObject } from "./schema";
import { cursorIcon, homeDirectory } from "./consts";
import {
  HomeDirectoryNotFoundError,
  NoNewVersionError,
  OperationCancelledError,
} from "./errors";

export const installCursor = Effect.gen(function* () {
  if (!homeDirectory) {
    return yield* Effect.fail(new HomeDirectoryNotFoundError());
  }

  const fs = yield* FileSystem.FileSystem;

  const version = yield* downloadCursor;

  log.info(`Installing Cursor ${version}...`);

  // Add execute permissions
  yield* fs.chmod("/tmp/cursor.appimage", 0o775);

  // Move file to bin
  yield* fs.copy(
    "/tmp/cursor.appimage",
    `${homeDirectory}/bin/cursor/cursor.appimage`
  );

  yield* fs.remove("/tmp/cursor.appimage");

  yield* fs.writeFile(`${homeDirectory}/bin/cursor/cursor.png`, cursorIcon);

  // Create desktop entry
  yield* fs.writeFileString(
    `${homeDirectory}/.local/share/applications/cursor.desktop`,
    `[Desktop Entry]
Name=Cursor
Comment=Better than VSCode
Exec=${homeDirectory}/bin/cursor/cursor.appimage %F
Icon=${homeDirectory}/bin/cursor/cursor.png
Type=Application
Categories=TextEditor;Development;IDE;
MimeType=application/x-code-workspace;
Keywords=cursor;

[Meta]
Version=${version}
`
  );
});

const downloadCursor = Effect.gen(function* () {
  const httpCLient = yield* HttpClient.HttpClient;
  const fs = yield* FileSystem.FileSystem;

  const downloadUrlResponse = yield* httpCLient.get(
    "https://www.cursor.com/api/download?platform=linux-x64&releaseTrack=stable"
  );

  const { downloadUrl, version: newVersion } = yield* Effect.retry(
    HttpClientResponse.schemaBodyJson(CursorDownloadObject)(
      downloadUrlResponse
    ),
    {
      times: 3,
      schedule: Schedule.exponential(1000),
    }
  );

  const currentVersion = yield* Effect.orElse(getCurrentCursorVersion, () =>
    Effect.succeed(undefined)
  );

  if (currentVersion && currentVersion === newVersion) {
    return yield* Effect.fail(
      new NoNewVersionError({
        currentVersion,
        newVersion,
      })
    );
  }

  const shouldDownload = yield* Effect.orElse(
    Effect.promise(() =>
      confirm({
        message: `New version available: ${newVersion}. Do you want to install it?`,
      })
    ),
    () => Effect.fail(new OperationCancelledError())
  );

  if (!shouldDownload || isCancel(shouldDownload)) {
    return yield* Effect.fail(new OperationCancelledError());
  }

  const appimageResponse = yield* httpCLient.get(downloadUrl);

  const appimageStream = appimageResponse.stream;

  let currentLength = 0;

  const contentLength = appimageResponse.headers["content-length"];

  const s = spinner({ indicator: "timer" });

  s.start("Downloading Cursor...");

  yield* Stream.run(
    appimageStream.pipe(
      Stream.tap((chunk) =>
        Effect.gen(function* () {
          currentLength += chunk.byteLength;

          const percentage = `${(
            (currentLength / Number(contentLength as string)) *
            100
          ).toFixed(0)}%`;

          s.message(percentage);
        })
      )
    ),
    fs.sink("/tmp/cursor.appimage")
  );

  s.stop("Downloaded Cursor");

  return newVersion;
});

const getCurrentCursorVersion = Effect.gen(function* () {
  if (!homeDirectory) {
    return yield* Effect.fail(new HomeDirectoryNotFoundError());
  }

  const fs = yield* FileSystem.FileSystem;

  const desktopFile = yield* fs.readFileString(
    `${homeDirectory}/.local/share/applications/cursor.desktop`
  );

  const desktopFileLines = desktopFile.split("\n");

  const versionLine = desktopFileLines.find((line) =>
    line.startsWith("Version=")
  );

  const currentVersion = versionLine?.split("=")[1];

  return currentVersion;
});
