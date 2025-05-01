import { Effect, Schedule, Stream } from "effect";
import { HttpClient, HttpClientResponse, FileSystem } from "@effect/platform";
import { spinner, log, confirm, isCancel } from "@clack/prompts";

import { CursorDownloadObject } from "./schemas";
import { cursorIcon, HOME_DIRECTORY, SHELL } from "./consts";
import {
  HomeDirectoryNotFoundError,
  NoNewVersionError,
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

  // Move file to bin
  yield* fs.copy(
    "/tmp/cursor.appimage",
    `${HOME_DIRECTORY}/bin/cursor/cursor.appimage`
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
`
  );

  // Add to PATH
  const shouldAddToPath = yield* Effect.orElse(
    Effect.promise(() =>
      confirm({
        message: `Do you want to add Cursor to your PATH?`,
      })
    ),
    () => Effect.succeed(false)
  );

  if (!shouldAddToPath || isCancel(shouldAddToPath)) {
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

  if (shellConfigFileContent.includes(`${HOME_DIRECTORY}/bin/cursor`)) {
    return;
  }

  if (SHELL.includes("bash")) {
    // Backup .bashrc
    yield* fs.copy(
      `${HOME_DIRECTORY}/.bashrc`,
      `${HOME_DIRECTORY}/.bashrc.pre-cursor-installer.backup`
    );

    // Add to end of .bashrc
    yield* fs.writeFileString(
      `${HOME_DIRECTORY}/.bashrc`,
      shellConfigFileContent.concat(
        `\n\n# Cursor\nexport PATH="${HOME_DIRECTORY}/bin/cursor:$PATH"`
      )
    );

    log.success("Cursor added to PATH. Make sure to restart your shell.");
  }

  if (SHELL.includes("zsh")) {
    // Backup .zshrc
    yield* fs.copy(
      `${HOME_DIRECTORY}/.zshrc`,
      `${HOME_DIRECTORY}/.zshrc.pre-cursor-installer.backup`
    );

    // Add to end of .zshrc
    yield* fs.writeFileString(
      `${HOME_DIRECTORY}/.zshrc`,
      shellConfigFileContent.concat(
        `\n\n# Cursor\nexport PATH="${HOME_DIRECTORY}/bin/cursor:$PATH"`
      )
    );

    log.success("Cursor added to PATH. Make sure to restart your shell.");
  }
});

const downloadCursor = Effect.gen(function* () {
  const httpCLient = yield* HttpClient.HttpClient;
  const fs = yield* FileSystem.FileSystem;

  log.step("Checking for new version of Cursor...");

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
  if (!HOME_DIRECTORY) {
    return yield* Effect.fail(new HomeDirectoryNotFoundError());
  }

  const fs = yield* FileSystem.FileSystem;

  const desktopFile = yield* fs.readFileString(
    `${HOME_DIRECTORY}/.local/share/applications/cursor.desktop`
  );

  const desktopFileLines = desktopFile.split("\n");

  const versionLine = desktopFileLines.find((line) =>
    line.startsWith("Version=")
  );

  const currentVersion = versionLine?.split("=")[1];

  return currentVersion;
});
