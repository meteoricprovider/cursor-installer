import { Data } from "effect";

import { SHELL } from "./consts";

export class HomeDirectoryNotFoundError extends Data.TaggedError(
	"HomeDirectoryNotFoundError",
)<{
	message: string;
}> {
	constructor() {
		super({ message: "Home directory not found." });
	}
}

export class OperationCancelledError extends Data.TaggedError(
	"OperationCancelledError",
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

export class InstallationFailedError extends Data.TaggedError(
	"InstallationFailedError",
)<{
	message: string;
}> {
	constructor() {
		super({
			message: "Installation failed, previous version restored.",
		});
	}
}

export class ShellConfigFileNotFoundError extends Data.TaggedError(
	"ShellConfigFileNotFoundError",
)<{
	message: string;
}> {
	constructor() {
		super({ message: `Shell config file for ${SHELL} not found.` });
	}
}
