import { Console, Effect, Schema, Stream } from "effect";
import { HttpClient, HttpClientResponse, FileSystem } from "@effect/platform";

class CursorDownloadObject extends Schema.Class<CursorDownloadObject>(
  "CursorDownloadObject"
)({
  version: Schema.String,
  downloadUrl: Schema.String,
  rehUrl: Schema.String,
}) {}

const downloadCursor = Effect.gen(function* () {
  const httpCLient = yield* HttpClient.HttpClient;
  const fs = yield* FileSystem.FileSystem;

  const downloadUrlResponse = yield* httpCLient.get(
    "https://www.cursor.com/api/download?platform=linux-x64&releaseTrack=stable"
  );

  const { downloadUrl } =
    yield* HttpClientResponse.schemaBodyJson(CursorDownloadObject)(
      downloadUrlResponse
    );

  console.log(downloadUrl);

  const appImageResponse = yield* httpCLient.get(downloadUrl);

  const contentLength = appImageResponse.headers["content-length"];

  const appImageStream = appImageResponse.stream;

  const sink = fs.sink("/tmp/cursor.appimage");

  let currentLength = 0;

  yield* Stream.run(
    appImageStream.pipe(
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
});

export const installCursor = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;

  yield* downloadCursor;

  // Add execute permissions
  yield* fs.chmod("/tmp/cursor.appimage", 0o775);

  // Move files to opt
  const homeDirectory = process.env["HOME"];

  if (!homeDirectory) {
    return yield* Effect.fail(new Error("bruh"));
  }

  yield* fs.copy(
    "/tmp/cursor.appimage",
    `${homeDirectory}/bin/cursor/cursor.appimage`,
    {
      overwrite: true,
    }
  );

  yield* fs.remove("/tmp/cursor.appimage");

  yield* fs.copy(
    "./assets/cursor.png",
    `${homeDirectory}/bin/cursor/cursor.png`,
    {
      overwrite: true,
    }
  );

  // Create desktop entry
  yield* fs.writeFileString(
    `${homeDirectory}/.local/share/applications/cursor.desktop`,
    `[Desktop Entry]
  Name=Cursor-test
  Exec=${homeDirectory}/bin/cursor/cursor.appimage
  Icon=${homeDirectory}/bin/cursor/cursor.png
  Type=Application
  Comment=Better than VSCode
  Categories=Development;`
  );
});
