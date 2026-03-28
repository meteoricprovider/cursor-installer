import { describe, expect, test } from "bun:test";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Layer } from "effect";

import { downloadCursor } from "./downloadCursor";
import {
	createTestCliUI,
	createTestFileSystem,
	createTestHttpClient,
} from "./test-helpers";

describe("downloadCursor", () => {
	test("returns new version after successful download", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		const httpLayer = createTestHttpClient({ version: "1.2.0" });
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer)),
		);

		expect(result).toBe("1.2.0");
	});

	test("fails with OperationCancelledError when user declines", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [false],
		});
		const httpLayer = createTestHttpClient();
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("OperationCancelledError");
		}
	});

	test("handles missing content-length header without NaN", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		const httpLayer = createTestHttpClient({
			appimageContentLength: null,
			appimageBody: new Uint8Array(1024 * 1024),
		});
		const { layer: fsLayer } = createTestFileSystem();

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer)),
		);

		expect(result).toBe("1.0.0");
	});

	test("still asks to install when version is up to date", async () => {
		const currentVersion = "1.0.0";
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		const httpLayer = createTestHttpClient({ version: currentVersion });
		const { layer: fsLayer } = createTestFileSystem({
			[`${process.env["HOME"]}/bin/cursor/cursor.appimage`]: "existing",
			[`${process.env["HOME"]}/.local/share/applications/cursor.desktop`]: `[Meta]\nVersion=${currentVersion}\n`,
		});

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer)),
		);

		expect(result).toBe(currentVersion);
	});

	test("fails with ParseError when API returns unexpected schema", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		const { layer: fsLayer } = createTestFileSystem();

		const httpLayer = Layer.succeed(
			HttpClient.HttpClient,
			HttpClient.make((req) =>
				Effect.succeed(
					HttpClientResponse.fromWeb(
						req,
						new Response(JSON.stringify({ unexpected: "schema" })),
					),
				),
			),
		);

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("ParseError");
		}
	});

	test("fails when API returns non-2xx status", async () => {
		const { layer: cliLayer } = createTestCliUI({
			confirmResponses: [true],
		});
		const { layer: fsLayer } = createTestFileSystem();

		const httpLayer = Layer.succeed(
			HttpClient.HttpClient,
			HttpClient.make((req) =>
				Effect.succeed(
					HttpClientResponse.fromWeb(
						req,
						new Response("Internal Server Error", { status: 500 }),
					),
				),
			),
		);

		const testLayer = Layer.mergeAll(cliLayer, httpLayer, fsLayer);

		const result = await Effect.runPromise(
			downloadCursor.pipe(Effect.provide(testLayer), Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("ResponseError");
		}
	}, 15_000);
});
