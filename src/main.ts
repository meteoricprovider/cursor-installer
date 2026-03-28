#!/usr/bin/env bun

import { FetchHttpClient } from "@effect/platform";
import { BunFileSystem, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

import { CliUI, CliUIAutoAccept, CliUIInteractive } from "./CliUI";
import { installCursor } from "./installCursor";

const autoAccept =
	process.argv.includes("--yes") || process.argv.includes("-y");
const uiLayer = autoAccept ? CliUIAutoAccept : CliUIInteractive;

const main = Effect.gen(function* () {
	const ui = yield* CliUI;
	ui.intro("Cursor Installer");

	yield* installCursor;

	ui.log.success("Cursor installed successfully!");
});

BunRuntime.runMain(
	main.pipe(
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
		Effect.provide(FetchHttpClient.layer),
		Effect.provide(BunFileSystem.layer),
		Effect.provide(uiLayer),
	),
);
