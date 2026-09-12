import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { CliProcessRegistry, NodeCliRunner, type SpawnProcess } from "./runner";

const node = process.execPath;

function success<T>(data: T) {
	return {
		success: true as const,
		code: "CONVERT_COMPLETED",
		message: "Converted",
		schema_version: "v1",
		status: "completed" as const,
		retryable: false,
		data,
	};
}

function failure(code: string) {
	return {
		success: false as const,
		code,
		schema_version: "v1",
		status: "failed" as const,
		retryable: false,
	};
}

function nodeProgram(source: string): readonly string[] {
	return ["-e", source];
}

function noDelay(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

class ControlledChild extends EventEmitter {
	readonly stdin: PassThrough | EventEmitter;
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly kill = vi.fn((_signal?: NodeJS.Signals | number) => true);

	constructor(stdin: PassThrough | EventEmitter = new PassThrough()) {
		super();
		this.stdin = stdin;
	}
}

function pendingState<T>(promise: Promise<T>): { settled(): boolean } {
	let done = false;
	void promise.finally(() => {
		done = true;
	});
	return { settled: () => done };
}

class FailingStdin extends EventEmitter {
	end(): void {
		this.emit("error", new Error("stdin closed early"));
	}
}

describe("NodeCliRunner", () => {
	test("uses a shell-free argument vector", async () => {
		const child = new ControlledChild();
		const spawn = vi.fn(() => child) as unknown as SpawnProcess;
		const runner = new NodeCliRunner("md2wechat", spawn);

		const result = runner.run([
			"convert",
			"--title",
			"hello; not-a-command",
		]);
		child.stdout.end(JSON.stringify(success(null)));
		child.emit("close", 0, null);

		await expect(result).resolves.toEqual(success(null));
		expect(spawn).toHaveBeenCalledWith(
			"md2wechat",
			["convert", "--title", "hello; not-a-command"],
			expect.objectContaining({ shell: false }),
		);
	});

	test("passes stdin unchanged and closes it", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run<{ stdin: string }>(
			nodeProgram(
				"let value=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', part => value += part); process.stdin.on('end', () => process.stdout.write(JSON.stringify({success:true,code:'CONVERT_COMPLETED',message:'Converted',schema_version:'v1',status:'completed',retryable:false,data:{stdin:value}})));",
			),
			{ stdin: "line one\nline two\u0000" },
		);

		expect(result).toEqual(success({ stdin: "line one\nline two\u0000" }));
	});

	test("returns a local failure envelope when stdin rejects a write", async () => {
		const child = new ControlledChild(new FailingStdin());
		child.kill.mockImplementation((signal) => {
			if (signal === "SIGTERM") child.emit("close", null, "SIGTERM");
			return true;
		});
		const spawn = vi.fn(() => child) as unknown as SpawnProcess;
		const runner = new NodeCliRunner("md2wechat", spawn);

		await expect(
			runner.run([], { stdin: "article body" }),
		).resolves.toMatchObject(failure("CLI_IO_ERROR"));
		expect(child.kill).toHaveBeenCalledWith("SIGTERM");
	});

	test("parses one JSON envelope from stdout while keeping stderr out of it", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run<{ converted: string }>(
			nodeProgram(
				"process.stderr.write('credential=super-secret-token'); process.stdout.write(JSON.stringify({success:true,code:'CONVERT_COMPLETED',message:'Converted',schema_version:'v1',status:'completed',retryable:false,data:{converted:'<p>ok</p>'}}));",
			),
		);

		expect(result).toEqual(success({ converted: "<p>ok</p>" }));
		expect(JSON.stringify(result)).not.toContain("super-secret-token");
	});

	test("reports a missing executable without exposing system details", async () => {
		const result = await new NodeCliRunner(
			"md2wechat-command-that-does-not-exist",
		).run([]);

		expect(result).toMatchObject(failure("CLI_NOT_FOUND"));
		expect(JSON.stringify(result)).not.toMatch(
			/ENOENT|spawn|md2wechat-command-that-does-not-exist/,
		);
	});

	test("preserves the CLI error envelope after a nonzero exit", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run(
			nodeProgram(
				"process.stdout.write(JSON.stringify({success:false,code:'INVALID_MARKDOWN',message:'Cannot convert',schema_version:'v1',status:'failed',retryable:false,error:'Cannot convert'})); process.exit(7);",
			),
		);

		expect(result).toEqual({
			success: false,
			code: "INVALID_MARKDOWN",
			message: "Cannot convert",
			schema_version: "v1",
			status: "failed",
			retryable: false,
			error: "Cannot convert",
		});
	});

	test("preserves a successful CLI envelope after a nonzero exit", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run(
			nodeProgram(
				"process.stdout.write(JSON.stringify({success:true,code:'CONVERT_COMPLETED',message:'Converted',schema_version:'v1',status:'completed',retryable:false,data:{html:'<p>ok</p>'}})); process.exit(7);",
			),
		);

		expect(result).toEqual(success({ html: "<p>ok</p>" }));
	});

	test("preserves a failed CLI envelope after a zero exit", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run(
			nodeProgram(
				"process.stdout.write(JSON.stringify({success:false,code:'INVALID_MARKDOWN',message:'Cannot convert',schema_version:'v1',status:'failed',retryable:false,error:'Cannot convert'}));",
			),
		);

		expect(result).toMatchObject(failure("INVALID_MARKDOWN"));
	});

	test("rejects an envelope with non-object error details", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run(
			nodeProgram(
				"process.stdout.write(JSON.stringify({success:false,code:'INVALID_MARKDOWN',message:'Cannot convert',schema_version:'v1',status:'failed',retryable:false,error_details:'details'}));",
			),
		);

		expect(result).toMatchObject(failure("CLI_PROTOCOL_ERROR"));
	});

	test("rejects an envelope with invalid next actions", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run(
			nodeProgram(
				"process.stdout.write(JSON.stringify({success:false,code:'INVALID_MARKDOWN',message:'Cannot convert',schema_version:'v1',status:'failed',retryable:false,next_actions:['read the error',42]}));",
			),
		);

		expect(result).toMatchObject(failure("CLI_PROTOCOL_ERROR"));
	});

	test("rejects non-JSON stdout as a protocol error without including stderr", async () => {
		const runner = new NodeCliRunner(node);
		const result = await runner.run(
			nodeProgram(
				"process.stderr.write('credential=super-secret-token'); process.stdout.write('not json');",
			),
		);

		expect(result).toMatchObject(failure("CLI_PROTOCOL_ERROR"));
		expect(JSON.stringify(result)).not.toContain("super-secret-token");
	});

	test("terminates a process that exceeds its timeout", async () => {
		const runner = new NodeCliRunner(node);
		const startedAt = Date.now();
		const result = await runner.run(
			nodeProgram("setInterval(() => {}, 1000);"),
			{ timeoutMs: 40 },
		);

		expect(result).toMatchObject(failure("CLI_TIMEOUT"));
		expect(Date.now() - startedAt).toBeLessThan(1000);
	});

	test("terminates a process when its signal is aborted", async () => {
		const controller = new AbortController();
		const runner = new NodeCliRunner(node);
		const promise = runner.run(
			nodeProgram("setInterval(() => {}, 1000);"),
			{ signal: controller.signal },
		);

		await noDelay();
		controller.abort();

		await expect(promise).resolves.toMatchObject(failure("CLI_ABORTED"));
	});

	test("does not report an abort until the child has actually closed", async () => {
		const child = new ControlledChild();
		const spawn = vi.fn(() => child) as unknown as SpawnProcess;
		const controller = new AbortController();
		const runner = new NodeCliRunner("md2wechat", spawn, {
			terminationGraceMs: 100,
		});
		const running = runner.run([], { signal: controller.signal });
		const state = pendingState(running);

		controller.abort();
		await Promise.resolve();

		expect(child.kill).toHaveBeenCalledWith("SIGTERM");
		expect(state.settled()).toBe(false);

		child.emit("close", null, "SIGTERM");
		await expect(running).resolves.toMatchObject(failure("CLI_ABORTED"));
	});

	test("escalates an ignored SIGTERM once and waits for SIGKILL close", async () => {
		vi.useFakeTimers();
		try {
			const child = new ControlledChild();
			child.kill.mockImplementation((signal) => {
				if (signal === "SIGKILL") child.emit("close", null, "SIGKILL");
				return true;
			});
			const spawn = vi.fn(() => child) as unknown as SpawnProcess;
			const controller = new AbortController();
			const runner = new NodeCliRunner("md2wechat", spawn, {
				terminationGraceMs: 25,
			});
			const running = runner.run([], { signal: controller.signal });

			controller.abort();
			controller.abort();
			await vi.advanceTimersByTimeAsync(24);
			expect(child.kill.mock.calls).toEqual([["SIGTERM"]]);

			await vi.advanceTimersByTimeAsync(1);
			await expect(running).resolves.toMatchObject(
				failure("CLI_ABORTED"),
			);
			expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
		} finally {
			vi.useRealTimers();
		}
	});

	test.each(["abort", "timeout"] as const)(
		"keeps the original %s result and tracking when SIGTERM synchronously emits an error",
		async (kind) => {
			vi.useFakeTimers();
			try {
				const child = new ControlledChild();
				child.kill.mockImplementation((signal) => {
					if (signal === "SIGTERM")
						child.emit(
							"error",
							Object.assign(new Error("kill denied"), {
								code: "EPERM",
							}),
						);
					if (signal === "SIGKILL")
						child.emit("close", null, "SIGKILL");
					return true;
				});
				const spawn = vi.fn(() => child) as unknown as SpawnProcess;
				const registry = new CliProcessRegistry();
				const controller = new AbortController();
				const runner = new NodeCliRunner(
					"md2wechat",
					spawn,
					{ defaultTimeoutMs: 40, terminationGraceMs: 25 },
					registry,
				);
				const running = runner.run(
					[],
					kind === "abort" ? { signal: controller.signal } : {},
				);
				const state = pendingState(running);

				if (kind === "abort") controller.abort();
				else await vi.advanceTimersByTimeAsync(40);
				await Promise.resolve();

				expect(state.settled()).toBe(false);
				expect(registry.activeCount).toBe(1);
				expect(child.kill.mock.calls).toEqual([["SIGTERM"]]);
				await vi.advanceTimersByTimeAsync(24);
				expect(state.settled()).toBe(false);
				expect(registry.activeCount).toBe(1);

				await vi.advanceTimersByTimeAsync(1);
				await expect(running).resolves.toMatchObject(
					failure(kind === "abort" ? "CLI_ABORTED" : "CLI_TIMEOUT"),
				);
				expect(child.kill.mock.calls).toEqual([
					["SIGTERM"],
					["SIGKILL"],
				]);
				expect(registry.activeCount).toBe(0);
			} finally {
				vi.useRealTimers();
			}
		},
	);

	test("an actual child that ignores SIGTERM is dead before abort resolves", async () => {
		let childPid: number | undefined;
		let ready!: () => void;
		const started = new Promise<void>((resolve) => {
			ready = resolve;
		});
		const realSpawn: SpawnProcess = (executable, args, options) => {
			const child = spawn(executable, [...args], options);
			childPid = child.pid;
			child.stdout?.once("data", () => ready());
			return child;
		};
		const controller = new AbortController();
		const runner = new NodeCliRunner(node, realSpawn, {
			terminationGraceMs: 25,
		});
		const running = runner.run(
			nodeProgram(
				"process.on('SIGTERM',()=>{}); process.stdout.write('ready\\n'); setInterval(()=>{},1000);",
			),
			{ signal: controller.signal },
		);
		await started;

		controller.abort();
		await expect(running).resolves.toMatchObject(failure("CLI_ABORTED"));

		expect(childPid).toBeDefined();
		expect(() => process.kill(childPid!, 0)).toThrow(
			expect.objectContaining({ code: "ESRCH" }),
		);
	});

	test("handles a synchronous close race during SIGTERM without later SIGKILL", async () => {
		vi.useFakeTimers();
		try {
			const child = new ControlledChild();
			child.kill.mockImplementation((signal) => {
				if (signal === "SIGTERM") child.emit("close", null, "SIGTERM");
				return true;
			});
			const spawn = vi.fn(() => child) as unknown as SpawnProcess;
			const controller = new AbortController();
			const runner = new NodeCliRunner("md2wechat", spawn, {
				terminationGraceMs: 25,
			});
			const running = runner.run([], { signal: controller.signal });

			controller.abort();
			await expect(running).resolves.toMatchObject(
				failure("CLI_ABORTED"),
			);
			await vi.advanceTimersByTimeAsync(25);

			expect(child.kill.mock.calls).toEqual([["SIGTERM"]]);
		} finally {
			vi.useRealTimers();
		}
	});

	test("applies a finite default timeout and resolves only after forced close", async () => {
		vi.useFakeTimers();
		try {
			const child = new ControlledChild();
			child.kill.mockImplementation((signal) => {
				if (signal === "SIGKILL") child.emit("close", null, "SIGKILL");
				return true;
			});
			const spawn = vi.fn(() => child) as unknown as SpawnProcess;
			const runner = new NodeCliRunner("md2wechat", spawn, {
				defaultTimeoutMs: 50,
				terminationGraceMs: 10,
			});
			const running = runner.run([]);

			await vi.advanceTimersByTimeAsync(50);
			expect(child.kill.mock.calls).toEqual([["SIGTERM"]]);
			await vi.advanceTimersByTimeAsync(10);

			await expect(running).resolves.toMatchObject(
				failure("CLI_TIMEOUT"),
			);
			expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
		} finally {
			vi.useRealTimers();
		}
	});

	test.each([
		["stdout", "stdout"],
		["stderr", "stderr"],
	] as const)(
		"terminates a child whose %s exceeds the bounded capture without exposing it",
		async (_label, streamName) => {
			const child = new ControlledChild();
			child.kill.mockImplementation((signal) => {
				if (signal === "SIGTERM") child.emit("close", null, "SIGTERM");
				return true;
			});
			const spawn = vi.fn(() => child) as unknown as SpawnProcess;
			const runner = new NodeCliRunner("md2wechat", spawn, {
				maxStdoutCharacters: 8,
				maxStderrCharacters: 8,
			});
			const running = runner.run([]);

			child[streamName].write("do-not-expose-this-output");

			const result = await running;
			expect(result).toMatchObject(failure("CLI_OUTPUT_LIMIT"));
			expect(JSON.stringify(result)).not.toContain("do-not-expose");
			expect(child.kill).toHaveBeenCalledWith("SIGTERM");
		},
	);

	test("does not make a network request or retry a failed command", async () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		const child = new ControlledChild();
		const spawn = vi.fn(() => child) as unknown as SpawnProcess;
		const runner = new NodeCliRunner("md2wechat", spawn);

		const result = runner.run([]);
		child.emit(
			"error",
			Object.assign(new Error("missing"), { code: "ENOENT" }),
		);
		child.emit("close", -2, null);

		await expect(result).resolves.toMatchObject(failure("CLI_NOT_FOUND"));
		expect(fetch).not.toHaveBeenCalled();
		expect(spawn).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});

	test("plugin shutdown synchronously kills every tracked child and prevents later spawns", async () => {
		const first = new ControlledChild();
		const second = new ControlledChild();
		const spawn = vi
			.fn()
			.mockReturnValueOnce(first)
			.mockReturnValueOnce(second) as unknown as SpawnProcess;
		const registry = new CliProcessRegistry();
		const runner = new NodeCliRunner("md2wechat", spawn, {}, registry);
		void runner.run(["version"]);
		void runner.run(["layout", "show", "hero"]);
		expect(registry.activeCount).toBe(2);

		registry.shutdownNow();

		expect(first.kill).toHaveBeenCalledWith("SIGKILL");
		expect(second.kill).toHaveBeenCalledWith("SIGKILL");
		expect(registry.activeCount).toBe(0);
		await expect(runner.run(["doctor"])).resolves.toMatchObject(
			failure("CLI_SHUTDOWN"),
		);
		expect(spawn).toHaveBeenCalledTimes(2);
	});
});

test("starts npm-style CLIs with a minimal GUI PATH", async () => {
	const { mkdtemp, writeFile, symlink, rm } =
		await import("node:fs/promises");
	const { join } = await import("node:path");
	const { tmpdir } = await import("node:os");
	const { createCliRunner } = await import("./runner");
	const dir = await mkdtemp(join(tmpdir(), "cli-gui-"));
	const previous = process.env.PATH;
	process.env.PATH = "/usr/bin:/bin";
	try {
		await symlink(process.execPath, join(dir, "md2w-test-runtime"));
		const file = join(dir, "md2wechat");
		await writeFile(
			file,
			"#!/usr/bin/env md2w-test-runtime\nconsole.log(" +
				JSON.stringify(JSON.stringify(success({ ready: true }))) +
				");\n",
			{ mode: 0o700 },
		);
		expect(
			(await createCliRunner(file).run(["version", "--json"])).success,
		).toBe(true);
		expect(process.env.PATH).toBe("/usr/bin:/bin");
	} finally {
		if (previous === undefined) delete process.env.PATH;
		else process.env.PATH = previous;
		await rm(dir, { recursive: true, force: true });
	}
});
