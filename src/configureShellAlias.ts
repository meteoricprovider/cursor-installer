import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

import { CliUI } from "./CliUI";
import {
	HOME_DIRECTORY as HomeDirectoryEffect,
	SHELL as ShellEffect,
} from "./utils/consts";
import {
	ShellConfigFileNotFoundError,
	UnsupportedShellError,
} from "./utils/errors";

export const configureShellAlias = (version: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const ui = yield* CliUI;

		const shouldAddAlias = yield* ui.confirm(
			"Do you want to add a Cursor alias to your shell?",
		);

		if (!shouldAddAlias) {
			return;
		}

		const SHELL = yield* ShellEffect;
		const HOME_DIRECTORY = yield* HomeDirectoryEffect;

		// Only check for bash and zsh
		const shellConfigFile = SHELL.includes("bash")
			? `${HOME_DIRECTORY}/.bashrc`
			: SHELL.includes("zsh")
				? `${HOME_DIRECTORY}/.zshrc`
				: undefined;

		if (!shellConfigFile) {
			return yield* Effect.fail(new UnsupportedShellError(SHELL));
		}

		if (!(yield* fs.exists(shellConfigFile))) {
			return yield* Effect.fail(new ShellConfigFileNotFoundError(SHELL));
		}

		const shellConfigFileContent = yield* fs.readFileString(shellConfigFile);

		const newAlias = `alias cursor='nohup ${HOME_DIRECTORY}/bin/cursor/cursor.appimage > /dev/null 2>&1 & disown'`;

		// New-format alias already present — nothing to do
		if (shellConfigFileContent.includes(newAlias)) {
			ui.log.warn("Cursor alias already exists.");

			return;
		}

		// Backup shell config
		yield* fs.copy(
			shellConfigFile,
			`${shellConfigFile}.pre-cursor-installer-${version}.backup`,
		);

		ui.log.info(
			`Current ${shellConfigFile.split("/").pop()} backed up as ${shellConfigFile.split("/").pop()}.pre-cursor-installer-${version}.backup`,
		);

		// Old-format alias present — replace it
		const oldAliasPattern = `alias cursor="${HOME_DIRECTORY}/bin/cursor/cursor.appimage"`;

		if (shellConfigFileContent.includes(oldAliasPattern)) {
			yield* fs.writeFileString(
				shellConfigFile,
				shellConfigFileContent.replace(oldAliasPattern, newAlias),
			);
			ui.log.success("Cursor alias updated. Make sure to restart your shell.");
			return;
		}

		// No alias — add new one
		yield* fs.writeFileString(
			shellConfigFile,
			shellConfigFileContent.concat(`\n\n# Cursor\n${newAlias}`),
		);

		ui.log.success("Cursor alias added. Make sure to restart your shell.");
	});
