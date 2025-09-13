#!/usr/bin/env bun

import { intro, log } from "@clack/prompts";
import { FetchHttpClient } from "@effect/platform";
import { BunFileSystem, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

import { installCursor } from "./helpers";

const main = Effect.gen(function* () {
	intro("Cursor Installer");

	yield* installCursor;

	log.success("Cursor installed successfully!");
});

BunRuntime.runMain(
	main.pipe(
		Effect.provide(FetchHttpClient.layer),
		Effect.provide(BunFileSystem.layer),
		Effect.catchAll((error) => Effect.succeed(log.error(error.message))),
	),
);
