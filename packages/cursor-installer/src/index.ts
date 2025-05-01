#!/usr/bin/env bun

import { Effect } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { BunRuntime, BunFileSystem } from "@effect/platform-bun";

import { installCursor } from "./helpers";

const main = Effect.gen(function* () {
  yield* installCursor;
}).pipe(Effect.catchAll((error) => Effect.succeed(console.log(error.message))));

BunRuntime.runMain(
  main.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(BunFileSystem.layer)
  )
);
