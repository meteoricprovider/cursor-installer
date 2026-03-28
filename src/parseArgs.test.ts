import { describe, expect, test } from "bun:test";
import { parseArgs } from "./parseArgs";

describe("parseArgs", () => {
	test("--help returns help action", () => {
		const result = parseArgs(["node", "main.ts", "--help"]);
		expect(result).toEqual({ type: "help" });
	});

	test("-h returns help action", () => {
		const result = parseArgs(["node", "main.ts", "-h"]);
		expect(result).toEqual({ type: "help" });
	});

	test("--version returns version action", () => {
		const result = parseArgs(["node", "main.ts", "--version"]);
		expect(result).toEqual({ type: "version" });
	});

	test("-v returns version action", () => {
		const result = parseArgs(["node", "main.ts", "-v"]);
		expect(result).toEqual({ type: "version" });
	});

	test("--yes returns run with autoAccept", () => {
		const result = parseArgs(["node", "main.ts", "--yes"]);
		expect(result).toEqual({ type: "run", autoAccept: true });
	});

	test("-y returns run with autoAccept", () => {
		const result = parseArgs(["node", "main.ts", "-y"]);
		expect(result).toEqual({ type: "run", autoAccept: true });
	});

	test("no flags returns run without autoAccept", () => {
		const result = parseArgs(["node", "main.ts"]);
		expect(result).toEqual({ type: "run", autoAccept: false });
	});
});
