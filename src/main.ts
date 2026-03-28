#!/usr/bin/env bun

import { FetchHttpClient } from "@effect/platform";
import { BunFileSystem, BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";

import pkg from "../package.json";
import { CliUI, CliUIAutoAccept, CliUIInteractive } from "./CliUI";
import { installCursor } from "./installCursor";
import { cliAction } from "./parseArgs";
import { UnknownCliActionError } from "./utils/errors";

const HELP_TEXT = `cursor-installer v${pkg.version}

Download and install the latest Cursor editor on Linux.

Usage: cursor-installer [options]

Options:
  --yes, -y       Auto-accept all prompts
  --help, -h      Show this help message
  --version, -v   Show version number`;

const install = Effect.gen(function* () {
	const ui = yield* CliUI;
	ui.intro("Cursor Installer");

	yield* installCursor;

	ui.log.success("Cursor installed successfully!");
}).pipe(
	Effect.catchTag("OperationCancelledError", () =>
		Effect.gen(function* () {
			const ui = yield* CliUI;
			ui.log.warn("Operation cancelled.");
		}),
	),
	Effect.catchTag("ParseError", () =>
		Effect.gen(function* () {
			const ui = yield* CliUI;
			ui.log.error(
				"The Cursor download API returned an unexpected response. Please update cursor-installer to the latest version.",
			);
		}),
	),
	Effect.catchTag("ResponseError", (error) =>
		Effect.gen(function* () {
			const ui = yield* CliUI;
			ui.log.error(
				`The Cursor download server returned an error (HTTP ${error.response.status}). Please try again later.`,
			);
		}),
	),
	Effect.catchTag("SystemError", (error) =>
		Effect.gen(function* () {
			const ui = yield* CliUI;
			ui.log.error(`System error: ${error.reason} — ${error.message}`);
		}),
	),
	Effect.catchAll((error) =>
		Effect.gen(function* () {
			const ui = yield* CliUI;
			ui.log.error(error.message);
		}),
	),
);

const main = cliAction.pipe(
	Effect.flatMap((action) => {
		switch (action.type) {
			case "help":
				return Console.log(HELP_TEXT);
			case "version":
				return Console.log(pkg.version);
			case "run": {
				const uiLayer = action.autoAccept ? CliUIAutoAccept : CliUIInteractive;
				return install.pipe(Effect.provide(uiLayer));
			}
			default: {
				const _exhaustive: never = action;
				return Effect.fail(new UnknownCliActionError(String(_exhaustive)));
			}
		}
	}),
);

BunRuntime.runMain(
	main.pipe(
		Effect.provide(FetchHttpClient.layer),
		Effect.provide(BunFileSystem.layer),
	),
);
