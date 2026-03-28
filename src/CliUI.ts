import {
	confirm as clackConfirm,
	intro as clackIntro,
	isCancel,
	log,
	spinner,
} from "@clack/prompts";
import { Context, Effect, Layer } from "effect";

import { OperationCancelledError } from "./utils/errors";

export interface Spinner {
	start(msg: string): void;
	stop(msg: string): void;
	message(msg: string): void;
}

export class CliUI extends Context.Tag("CliUI")<
	CliUI,
	{
		readonly intro: (msg: string) => void;
		readonly confirm: (
			msg: string,
		) => Effect.Effect<boolean, OperationCancelledError>;
		readonly spinner: (indicator: "dots" | "timer") => Spinner;
		readonly log: {
			readonly success: (msg: string) => void;
			readonly error: (msg: string) => void;
			readonly step: (msg: string) => void;
			readonly info: (msg: string) => void;
			readonly warn: (msg: string) => void;
		};
	}
>() {}

const cliUIImpl = {
	intro: clackIntro,
	confirm: (msg: string) =>
		Effect.tryPromise({
			try: () => clackConfirm({ message: msg }),
			catch: () => new OperationCancelledError(),
		}).pipe(
			Effect.flatMap((value) =>
				isCancel(value)
					? Effect.fail(new OperationCancelledError())
					: Effect.succeed(value),
			),
		),
	spinner: (indicator: "dots" | "timer") => spinner({ indicator }),
	log,
};

export const CliUIInteractive = Layer.succeed(CliUI, cliUIImpl);

export const CliUIAutoAccept = Layer.succeed(CliUI, {
	...cliUIImpl,
	confirm: (_msg: string) => Effect.succeed(true),
});
