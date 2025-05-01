import { Data } from "effect";
import { SHELL } from "./consts";

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

export class OperationCancelledError extends Data.TaggedError(
  "OperationCancelledError"
)<{
  message: string;
}> {
  constructor() {
    super({ message: "Operation cancelled." });
  }
}

export class ShellNotFoundError extends Data.TaggedError("ShellNotFoundError")<{
  message: string;
}> {
  constructor() {
    super({ message: "$SHELL not found." });
  }
}

export class ShellConfigFileNotFoundError extends Data.TaggedError(
  "ShellConfigFileNotFoundError"
)<{
  message: string;
}> {
  constructor() {
    super({ message: `Shell config file for ${SHELL} not found.` });
  }
}
