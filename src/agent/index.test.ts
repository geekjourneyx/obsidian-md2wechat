import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
	runProcess,
	runtimeDirectories,
	parseClaudeResult,
	claudeArguments,
	codexArguments,
	parseCodexResult,
} from "./index";

describe("isolated text generation", () => {
	it("takes final text only", () => {
		expect(
			parseClaudeResult(
				JSON.stringify({
					type: "result",
					is_error: false,
					result: "hello",
				}),
			),
		).toBe("hello");
	});
	it("never exposes raw provider error content", () => {
		expect(() =>
			parseClaudeResult(
				JSON.stringify({
					type: "result",
					is_error: true,
					result: "secret-token",
				}),
			),
		).toThrow("登录");
		expect(() => parseClaudeResult("secret-token")).toThrow("返回");
	});
	it("disables customizations and every Claude tool without bypassing permissions", () => {
		expect(claudeArguments()).toEqual(
			expect.arrayContaining([
				"--safe-mode",
				"--tools",
				"",
				"--strict-mcp-config",
				"--no-session-persistence",
			]),
		);
		expect(claudeArguments().join(" ")).not.toContain("bypass");
	});
	it("passes input over stdin and collects output", async () => {
		expect(
			await runProcess(
				process.execPath,
				["-e", "process.stdin.pipe(process.stdout)"],
				{ cwd: "/private/tmp", input: "正文" },
			),
		).toBe("正文");
	});
	it("cancels running and already cancelled tasks", async () => {
		const controller = new AbortController();
		const pending = runProcess(
			process.execPath,
			["-e", "setInterval(()=>{},1000)"],
			{ cwd: "/private/tmp", signal: controller.signal },
		);
		controller.abort();
		await expect(pending).rejects.toThrow("取消");
		await expect(
			runProcess(process.execPath, [], {
				cwd: "/private/tmp",
				signal: controller.signal,
			}),
		).rejects.toThrow("取消");
	});
	it("preserves Chinese split across process output chunks", async () => {
		expect(
			await runProcess(
				process.execPath,
				[
					"-e",
					'const b=Buffer.from("中文");process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),20)',
				],
				{ cwd: "/private/tmp" },
			),
		).toBe("中文");
	});
	it("bounds time and output", async () => {
		await expect(
			runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
				cwd: "/private/tmp",
				timeoutMs: 40,
			}),
		).rejects.toThrow("超时");
		await expect(
			runProcess(
				process.execPath,
				["-e", 'process.stdout.write("x".repeat(10000))'],
				{ cwd: "/private/tmp", maxOutput: 100 },
			),
		).rejects.toThrow("过长");
	});
	it("cancellation also terminates spawned descendants", async () => {
		const marker = `/private/tmp/md2wechat-agent-descendant-${process.pid}.pid`;
		rmSync(marker, { force: true });
		const controller = new AbortController();
		const script = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('fs').writeFileSync(${JSON.stringify(marker)},String(c.pid));setInterval(()=>{},1000)`;
		const pending = runProcess(process.execPath, ["-e", script], {
			cwd: "/private/tmp",
			signal: controller.signal,
		});
		const failure = pending.catch((e) => e);
		for (let i = 0; i < 100 && !existsSync(marker); i++)
			await new Promise((r) => setTimeout(r, 10));
		expect(existsSync(marker)).toBe(true);
		const pid = Number(readFileSync(marker, "utf8"));
		controller.abort();
		expect((await failure).message).toContain("取消");
		await new Promise((r) => setTimeout(r, 50));
		expect(() => process.kill(pid, 0)).toThrow();
		rmSync(marker, { force: true });
	});
	it("redacts subprocess failures", async () => {
		await expect(
			runProcess(
				process.execPath,
				["-e", 'console.error("secret-key");process.exit(1)'],
				{ cwd: "/private/tmp" },
			),
		).rejects.toThrow("连接失败");
	});
	it("enforces native read-only Codex and denies approvals", () => {
		expect(codexArguments()).toEqual(
			expect.arrayContaining([
				"read-only",
				'approval_policy="never"',
				"--ignore-user-config",
			]),
		);
		expect(
			parseCodexResult(
				JSON.stringify({
					type: "item.completed",
					item: { type: "agent_message", text: "done" },
				}),
			),
		).toBe("done");
	});
});

it("starts env-shebang tools with a minimal desktop PATH without changing the parent environment", async () => {
	const { mkdtemp, writeFile, symlink, rm } =
		await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = await mkdtemp(join(tmpdir(), "agent-desktop-path-"));
	const original = process.env.PATH;
	process.env.PATH = "/usr/bin:/bin";
	try {
		await symlink(process.execPath, join(dir, "md2w-test-runtime"));
		const cli = join(dir, "test-agent");
		await writeFile(
			cli,
			'#!/usr/bin/env md2w-test-runtime\nprocess.stdout.write("desktop-ok");\n',
			{ mode: 0o700 },
		);
		expect(await runProcess(cli, [], { cwd: dir })).toBe("desktop-ok");
		expect(process.env.PATH).toBe("/usr/bin:/bin");
	} finally {
		if (original === undefined) delete process.env.PATH;
		else process.env.PATH = original;
		await rm(dir, { recursive: true, force: true });
	}
});

it("finds installed NVM runtimes without evaluating shell configuration", async () => {
	const { mkdtemp, mkdir, rm } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const { tmpdir } = await import("node:os");
	const home = await mkdtemp(join(tmpdir(), "agent-nvm-"));
	try {
		await mkdir(join(home, ".nvm/versions/node/v22.17.0/bin"), {
			recursive: true,
		});
		await mkdir(join(home, ".nvm/versions/node/v20.1.0/bin"), {
			recursive: true,
		});
		expect(runtimeDirectories(home)).toEqual([
			join(home, ".nvm/versions/node/v22.17.0/bin"),
			join(home, ".nvm/versions/node/v20.1.0/bin"),
		]);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
