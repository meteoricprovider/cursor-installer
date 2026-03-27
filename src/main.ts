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
