#!/usr/bin/env bun

import { Effect } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { BunRuntime, BunFileSystem } from "@effect/platform-bun";
import { intro, log } from "@clack/prompts";

import { installCursor } from "./helpers";

const main = Effect.gen(function* () {
  intro("cursor-installer");

  yield* installCursor;

  log.success("Cursor installed successfully!");
});

BunRuntime.runMain(
  main.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(BunFileSystem.layer),
    Effect.catchAll((error) => Effect.succeed(log.error(error.message)))
  )
);
