import { Effect } from "effect";

export type CliAction =
	| { type: "help" }
	| { type: "version" }
	| { type: "run"; autoAccept: boolean };

export function parseArgs(argv: string[]): CliAction {
	if (argv.includes("--help") || argv.includes("-h")) {
		return { type: "help" };
	}

	if (argv.includes("--version") || argv.includes("-v")) {
		return { type: "version" };
	}

	const autoAccept = argv.includes("--yes") || argv.includes("-y");

	return { type: "run", autoAccept };
}

export const cliAction = Effect.sync(() => parseArgs(process.argv));
