import {
	FileSystem,
	HttpClient,
	HttpClientResponse,
	Error as PlatformError,
} from "@effect/platform";
import { Effect, Layer, Sink } from "effect";

import { CliUI, type Spinner } from "./CliUI";

// --- Mock CliUI ---

export const createTestCliUI = (options?: { confirmResponses?: boolean[] }) => {
	let confirmIndex = 0;
	const logs: Array<{ level: string; message: string }> = [];

	const noopSpinner: Spinner = {
		start: () => {},
		stop: () => {},
		message: () => {},
	};

	const layer = Layer.succeed(CliUI, {
		intro: () => {},
		confirm: () => {
			const response = options?.confirmResponses?.[confirmIndex] ?? true;
			confirmIndex++;
			return Effect.succeed(response);
		},
		spinner: () => noopSpinner,
		log: {
			success: (msg: string) => {
				logs.push({ level: "success", message: msg });
			},
			error: (msg: string) => {
				logs.push({ level: "error", message: msg });
			},
			step: (msg: string) => {
				logs.push({ level: "step", message: msg });
			},
			info: (msg: string) => {
				logs.push({ level: "info", message: msg });
			},
			warn: (msg: string) => {
				logs.push({ level: "warn", message: msg });
			},
		},
	});

	return { layer, logs };
};

// --- Mock HttpClient ---

export const createTestHttpClient = (options?: {
	version?: string;
	downloadUrl?: string;
	appimageBody?: Uint8Array;
	appimageContentLength?: string | null;
}) => {
	const version = options?.version ?? "1.0.0";
	const downloadUrl =
		options?.downloadUrl ?? "https://download.example.com/cursor.appimage";
	const appimageBody = options?.appimageBody ?? new Uint8Array([1, 2, 3]);

	const apiResponseBody = JSON.stringify({
		version,
		downloadUrl,
		rehUrl: "https://reh.example.com",
	});

	return Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((req) => {
			if (req.url.includes("cursor.com/api/download")) {
				return Effect.succeed(
					HttpClientResponse.fromWeb(req, new Response(apiResponseBody)),
				);
			}

			const headers: Record<string, string> = {};
			if (options?.appimageContentLength !== null) {
				headers["content-length"] =
					options?.appimageContentLength ?? String(appimageBody.length);
			}

			return Effect.succeed(
				HttpClientResponse.fromWeb(
					req,
					new Response(appimageBody, { headers }),
				),
			);
		}),
	);
};

// --- Mock FileSystem ---

export const createTestFileSystem = (
	initialFiles?: Record<string, string>,
	options?: { failCopyFrom?: string | string[] },
) => {
	const files = new Map<string, string>(Object.entries(initialFiles ?? {}));
	const binaryFiles = new Map<string, Uint8Array>();
	const operations: Array<{ op: string; path: string; from?: string }> = [];

	const layer = FileSystem.layerNoop({
		exists: (path) => Effect.succeed(files.has(path)),
		readFileString: (path) => {
			const content = files.get(path);

			if (content === undefined) {
				return Effect.fail(
					new PlatformError.SystemError({
						reason: "NotFound",
						module: "FileSystem",
						method: "readFileString",
						description: `File not found: ${path}`,
					}),
				);
			}

			return Effect.succeed(content);
		},
		writeFileString: (path, content) => {
			files.set(path, content as string);
			return Effect.void;
		},
		writeFile: (path, data) => {
			binaryFiles.set(path, data as Uint8Array);
			return Effect.void;
		},
		copy: (from, to) => {
			operations.push({ op: "copy", path: to, from });

			const failPaths = options?.failCopyFrom
				? Array.isArray(options.failCopyFrom)
					? options.failCopyFrom
					: [options.failCopyFrom]
				: [];

			if (failPaths.includes(from)) {
				return Effect.fail(
					new PlatformError.SystemError({
						reason: "Unknown",
						module: "FileSystem",
						method: "copy",
						description: `Simulated copy failure from: ${from} to: ${to}`,
					}),
				);
			}

			const content = files.get(from);

			if (content !== undefined) {
				files.set(to, content);
			}

			return Effect.void;
		},
		remove: (path) => {
			operations.push({ op: "remove", path });
			files.delete(path);
			return Effect.void;
		},
		makeDirectory: (path) => {
			operations.push({ op: "makeDirectory", path });
			return Effect.void;
		},
		chmod: () => Effect.void,
		sink: () => Sink.drain,
	});

	return { layer, files, binaryFiles, operations };
};
