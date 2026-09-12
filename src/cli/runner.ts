import { cliEnvironment } from "./environment";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import type {
	CliEnvelope,
	CliFailureEnvelope,
	CliRunner,
	RunOptions,
} from "./contracts";

const DEFAULT_TIMEOUT_MS = 120_000;
const TERMINATION_GRACE_MS = 250;
const MAX_STDOUT_CHARACTERS = 16 * 1024 * 1024;
const MAX_STDERR_CHARACTERS = 64 * 1024;

export interface SpawnProcess {
	(
		executable: string,
		args: readonly string[],
		options: { shell: false },
	): ChildProcess;
}

export interface RunnerPolicy {
	defaultTimeoutMs?: number;
	terminationGraceMs?: number;
	maxStdoutCharacters?: number;
	maxStderrCharacters?: number;
}

export class CliProcessRegistry {
	private readonly children = new Set<ChildProcess>();
	private stopped = false;

	get activeCount(): number {
		return this.children.size;
	}
	get closed(): boolean {
		return this.stopped;
	}

	tryTrack(child: ChildProcess): boolean {
		if (this.stopped) return false;
		this.children.add(child);
		return true;
	}

	untrack(child: ChildProcess): void {
		this.children.delete(child);
	}

	shutdownNow(): void {
		if (this.stopped) return;
		this.stopped = true;
		const children = [...this.children];
		this.children.clear();
		for (const child of children) {
			try {
				child.kill("SIGKILL");
			} catch {
				/* Shutdown remains fail-closed. */
			}
		}
	}
}

function spawnProcess(
	executable: string,
	args: readonly string[],
	options: { shell: false },
): ChildProcess {
	return nodeSpawn(executable, [...args], {
		...options,
		env: cliEnvironment(executable),
	});
}

function runnerFailure(code: string, message: string): CliFailureEnvelope {
	return {
		success: false,
		code,
		message,
		schema_version: "v1",
		status: "failed",
		retryable: false,
		error: message,
	};
}

function isCliEnvelope(value: unknown): value is CliEnvelope<unknown> {
	if (value === null || typeof value !== "object") return false;
	const envelope = value as Record<string, unknown>;
	if (
		typeof envelope.success !== "boolean" ||
		typeof envelope.code !== "string" ||
		typeof envelope.message !== "string" ||
		typeof envelope.schema_version !== "string" ||
		typeof envelope.retryable !== "boolean"
	)
		return false;

	if (envelope.success) {
		return (
			(envelope.status === "completed" ||
				envelope.status === "action_required") &&
			"data" in envelope
		);
	}

	return (
		envelope.status === "failed" &&
		(envelope.error === undefined || typeof envelope.error === "string") &&
		(envelope.error_details === undefined ||
			isErrorDetails(envelope.error_details)) &&
		(envelope.next_actions === undefined ||
			isNextActions(envelope.next_actions))
	);
}

function isErrorDetails(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNextActions(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.every((action) => typeof action === "string")
	);
}

function parseEnvelope<T>(stdout: string): CliEnvelope<T> | undefined {
	try {
		const parsed: unknown = JSON.parse(stdout);
		return isCliEnvelope(parsed) ? (parsed as CliEnvelope<T>) : undefined;
	} catch {
		return undefined;
	}
}

export class NodeCliRunner implements CliRunner {
	private readonly policy: Required<RunnerPolicy>;

	constructor(
		private readonly executable: string,
		private readonly spawn: SpawnProcess = spawnProcess,
		policy: RunnerPolicy = {},
		private readonly registry?: CliProcessRegistry,
	) {
		this.policy = {
			defaultTimeoutMs: policy.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
			terminationGraceMs:
				policy.terminationGraceMs ?? TERMINATION_GRACE_MS,
			maxStdoutCharacters:
				policy.maxStdoutCharacters ?? MAX_STDOUT_CHARACTERS,
			maxStderrCharacters:
				policy.maxStderrCharacters ?? MAX_STDERR_CHARACTERS,
		};
	}

	run<T>(
		args: readonly string[],
		options: RunOptions = {},
	): Promise<CliEnvelope<T>> {
		if (this.registry?.closed === true) {
			return Promise.resolve(
				runnerFailure("CLI_SHUTDOWN", "The plugin is shutting down."),
			);
		}
		if (options.signal?.aborted) {
			return Promise.resolve(
				runnerFailure("CLI_ABORTED", "The command was cancelled."),
			);
		}

		return new Promise((resolve) => {
			let stdout = "";
			let stderr = "";
			let finished = false;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			let forceKillTimeout: ReturnType<typeof setTimeout> | undefined;
			let child: ChildProcess;
			let terminationResult: CliEnvelope<T> | undefined;

			const finish = (result: CliEnvelope<T>) => {
				if (finished) return;
				finished = true;
				if (child !== undefined) this.registry?.untrack(child);
				if (timeout) clearTimeout(timeout);
				if (forceKillTimeout) clearTimeout(forceKillTimeout);
				options.signal?.removeEventListener("abort", abort);
				resolve(result);
			};

			const terminate = (result: CliEnvelope<T>) => {
				if (finished || terminationResult !== undefined) return;
				terminationResult = result;
				if (timeout) clearTimeout(timeout);
				try {
					child.kill("SIGTERM");
				} catch {
					/* A concurrent close still owns completion. */
				}
				if (finished) return;
				forceKillTimeout = setTimeout(
					() => {
						if (finished) return;
						try {
							child.kill("SIGKILL");
						} catch {
							/* SIGKILL races with close. */
						}
					},
					Math.max(0, this.policy.terminationGraceMs),
				);
			};

			const abort = () =>
				terminate(
					runnerFailure("CLI_ABORTED", "The command was cancelled."),
				);

			try {
				child = this.spawn(this.executable, args, { shell: false });
				if (this.registry?.tryTrack(child) === false) {
					try {
						child.kill("SIGKILL");
					} catch {
						/* The closed registry rejects the process. */
					}
					finish(
						runnerFailure(
							"CLI_SHUTDOWN",
							"The plugin is shutting down.",
						),
					);
					return;
				}
			} catch (error) {
				const code =
					(error as NodeJS.ErrnoException).code === "ENOENT"
						? "CLI_NOT_FOUND"
						: "CLI_EXECUTION_ERROR";
				finish(
					runnerFailure(code, "The command could not be started."),
				);
				return;
			}

			child.stdout?.setEncoding("utf8");
			child.stdout?.on("data", (chunk: string) => {
				if (terminationResult !== undefined) return;
				if (
					stdout.length + chunk.length >
					this.policy.maxStdoutCharacters
				) {
					terminate(
						runnerFailure(
							"CLI_OUTPUT_LIMIT",
							"The command produced too much output.",
						),
					);
					return;
				}
				stdout += chunk;
			});
			child.stderr?.setEncoding("utf8");
			child.stderr?.on("data", (chunk: string) => {
				if (terminationResult !== undefined) return;
				if (
					stderr.length + chunk.length >
					this.policy.maxStderrCharacters
				) {
					terminate(
						runnerFailure(
							"CLI_OUTPUT_LIMIT",
							"The command produced too much output.",
						),
					);
					return;
				}
				stderr += chunk;
			});

			child.once("error", (error) => {
				if (terminationResult !== undefined) return;
				const code =
					(error as NodeJS.ErrnoException).code === "ENOENT"
						? "CLI_NOT_FOUND"
						: "CLI_EXECUTION_ERROR";
				finish(
					runnerFailure(code, "The command could not be started."),
				);
			});
			child.once("close", () => {
				if (terminationResult !== undefined) {
					finish(terminationResult);
					return;
				}
				void stderr;
				finish(
					parseEnvelope<T>(stdout) ??
						runnerFailure(
							"CLI_PROTOCOL_ERROR",
							"The command returned an invalid response.",
						),
				);
			});

			const timeoutMs = options.timeoutMs ?? this.policy.defaultTimeoutMs;
			if (timeoutMs >= 0) {
				timeout = setTimeout(() => {
					terminate(
						runnerFailure("CLI_TIMEOUT", "The command timed out."),
					);
				}, timeoutMs);
			}
			options.signal?.addEventListener("abort", abort, { once: true });
			child.stdin?.once("error", () => {
				terminate(
					runnerFailure(
						"CLI_IO_ERROR",
						"The command input could not be written.",
					),
				);
			});
			try {
				child.stdin?.end(options.stdin);
			} catch {
				terminate(
					runnerFailure(
						"CLI_IO_ERROR",
						"The command input could not be written.",
					),
				);
			}
		});
	}
}

export function createCliRunner(
	executable = "md2wechat",
	registry?: CliProcessRegistry,
): CliRunner {
	return new NodeCliRunner(executable, spawnProcess, {}, registry);
}
