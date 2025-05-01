import { Data } from "effect";

export class NoNewVersionError extends Data.TaggedError("NoNewVersionError")<{
  message: string;
  currentVersion: string;
  newVersion: string;
}> {
  constructor({
    currentVersion,
    newVersion,
  }: {
    currentVersion: string;
    newVersion: string;
  }) {
    super({
      message: `Cursor is up to date: Current version: ${currentVersion} | Fetched version: ${newVersion}`,
      currentVersion,
      newVersion,
    });
  }
}

export class HomeDirectoryNotFoundError extends Data.TaggedError(
  "HomeDirectoryNotFoundError"
)<{
  message: string;
}> {
  constructor() {
    super({ message: "Home directory not found." });
  }
}
