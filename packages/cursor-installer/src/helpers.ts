import { Console, Effect, Stream } from "effect";
import { HttpClient, HttpClientResponse, FileSystem } from "@effect/platform";

import { CursorDownloadObject } from "./schema";
import { cursorIcon, homeDirectory } from "./consts";

export const installCursor = Effect.gen(function* () {
  if (!homeDirectory) {
    return yield* Effect.fail(new Error("bruh"));
  }

  const fs = yield* FileSystem.FileSystem;

  const version = yield* downloadCursor;

  // Add execute permissions
  yield* fs.chmod("/tmp/cursor.appimage", 0o775);

  // Move file to bin
  yield* fs.copy(
    "/tmp/cursor.appimage",
    `${homeDirectory}/bin/cursor/cursor.appimage`,
    {
      overwrite: true,
    }
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

  const { downloadUrl, version: newVersion } =
    yield* HttpClientResponse.schemaBodyJson(CursorDownloadObject)(
      downloadUrlResponse
    );

  const currentVersion = yield* getCurrentCursorVersion;

  if (currentVersion && currentVersion === newVersion) {
    return yield* Effect.fail(new Error("No new version found"));
  }

  const appimageResponse = yield* httpCLient.get(downloadUrl);

  const contentLength = appimageResponse.headers["content-length"];

  const appimageStream = appimageResponse.stream;

  const sink = fs.sink("/tmp/cursor.appimage");

  let currentLength = 0;

  yield* Stream.run(
    appimageStream.pipe(
      Stream.tap((chunk) =>
        Effect.gen(function* () {
          yield* Console.clear;

          currentLength += chunk.byteLength;

          const percentage = `${(
            (currentLength / Number(contentLength as string)) *
            100
          ).toFixed(0)}%`;

          return yield* Console.log(percentage);
        })
      )
    ),
    sink
  );

  return newVersion;
});

const getCurrentCursorVersion = Effect.gen(function* () {
  if (!homeDirectory) {
    return yield* Effect.fail(new Error("bruh"));
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
