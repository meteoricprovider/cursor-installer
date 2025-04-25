import { Effect } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { BunRuntime, BunFileSystem } from "@effect/platform-bun";

import { installCursor } from "@utility-scripts/cursor/src/helpers";

const main = Effect.gen(function* () {
  yield* installCursor;
});

BunRuntime.runMain(
  main.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(BunFileSystem.layer)
  )
);
