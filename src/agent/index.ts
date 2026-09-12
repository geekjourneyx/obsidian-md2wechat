import { cliEnvironment } from "../cli/environment";
export { runtimeDirectories } from "../cli/environment";
import { StringDecoder } from "node:string_decoder";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

export type AgentProvider = "codex" | "claude";
export interface AgentInstallation {
	id: AgentProvider;
	name: string;
	available: boolean;
	path?: string;
	version?: string;
}
interface ProcessOptions {
	cwd: string;
	input?: string;
	signal?: AbortSignal;
	timeoutMs?: number;
	maxOutput?: number;
}

/** Never returns stderr: provider logs may contain article text or authentication details. */
export function runProcess(
	executable: string,
	args: string[],
	options: ProcessOptions,
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new Error("已取消生成。"));
			return;
		}
		const child = spawn(executable, args, {
			cwd: options.cwd,
			shell: false,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
			env: cliEnvironment(executable),
		});
		const decoder = new StringDecoder("utf8");
		let output = "";
		let settled = false;
		let bytes = 0;
		const kill = () => {
			try {
				if (process.platform !== "win32" && child.pid)
					process.kill(-child.pid, "SIGKILL");
				else child.kill("SIGKILL");
			} catch {
				/* already exited */
			}
		};
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			// Kill remaining descendants even if the parent has already exited.
			kill();
			if (error) reject(error);
			else resolve(output + decoder.end());
		};
		const abort = () => finish(new Error("已取消生成。"));
		const timer = setTimeout(
			() => finish(new Error("生成超时，请稍后重新发起。")),
			options.timeoutMs ?? 180000,
		);
		options.signal?.addEventListener("abort", abort, { once: true });
		if (options.signal?.aborted) abort();
		child.stdout.on("data", (chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes > (options.maxOutput ?? 4 * 1024 * 1024))
				finish(new Error("生成内容过长，请缩短文章后重试。"));
			else output += decoder.write(chunk);
		});
		child.stderr.resume();
		child.on("error", () =>
			finish(new Error("无法启动 AI 工具，请检查安装后重试。")),
		);
		child.on("close", (code) =>
			finish(
				code === 0
					? undefined
					: new Error(
							"AI 连接失败，请在所选工具中检查登录、网络及账户额度后重试。",
						),
			),
		);
		child.stdin.on("error", () => {
			/* process close reports the actionable failure */
		});
		child.stdin.end(options.input ?? "");
	});
}

async function locate(id: AgentProvider): Promise<string | undefined> {
	const dirs = [
		...(process.env.PATH ?? "").split(delimiter),
		join(homedir(), ".local", "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		join(homedir(), ".npm-global", "bin"),
	];
	for (const dir of dirs.filter(Boolean)) {
		const path = join(dir, process.platform === "win32" ? `${id}.exe` : id);
		try {
			await access(path, constants.X_OK);
			return path;
		} catch {
			/* next known installation path */
		}
	}
	return undefined;
}
export async function discoverAgents(): Promise<AgentInstallation[]> {
	return Promise.all(
		(["codex", "claude"] as const).map(async (id) => {
			const path = await locate(id);
			const item: AgentInstallation = {
				id,
				name: id === "codex" ? "Codex" : "Claude Code",
				available: false,
			};
			if (!path) return item;
			try {
				const version = await runProcess(path, ["--version"], {
					cwd: homedir(),
					timeoutMs: 5000,
					maxOutput: 4096,
				});
				return {
					...item,
					path,
					available: true,
					version: version.match(/\d+\.\d+\.\d+/)?.[0],
				};
			} catch {
				return item;
			}
		}),
	);
}
export function claudeArguments(): string[] {
	return [
		"--print",
		"--output-format",
		"json",
		"--safe-mode",
		"--tools",
		"",
		"--strict-mcp-config",
		"--mcp-config",
		'{"mcpServers":{}}',
		"--no-session-persistence",
		"--disable-slash-commands",
		"--no-chrome",
	];
}
export function codexArguments(): string[] {
	// Authentication remains in the CLI's existing account; no credentials are read here.
	// Native read-only sandbox is mandatory. Never add bypass or writable directories.
	return [
		"exec",
		"--json",
		"--ephemeral",
		"--ignore-user-config",
		"--skip-git-repo-check",
		"--sandbox",
		"read-only",
		"-c",
		'approval_policy="never"',
		"-c",
		"features.shell_tool=false",
		"-c",
		'web_search="disabled"',
		"-",
	];
}
export function parseClaudeResult(output: string): string {
	let result: { type?: string; is_error?: boolean; result?: unknown };
	try {
		result = JSON.parse(output);
	} catch {
		throw new Error("AI 返回内容无法读取，请更新工具后重试。");
	}
	if (result.is_error)
		throw new Error("AI 生成失败，请检查工具中的登录、网络及账户额度。");
	if (
		result.type !== "result" ||
		typeof result.result !== "string" ||
		!result.result.trim()
	)
		throw new Error("AI 未返回可用内容，请重新发起。");
	return result.result;
}
export function parseCodexResult(output: string): string {
	let text = "";
	for (const line of output.split("\n").filter(Boolean)) {
		let event: { type?: string; item?: { type?: string; text?: string } };
		try {
			event = JSON.parse(line);
		} catch {
			throw new Error("AI 返回内容无法读取，请更新工具后重试。");
		}
		if (event.type === "turn.failed" || event.type === "error")
			throw new Error(
				"AI 生成失败，请检查工具中的登录、网络及账户额度。",
			);
		if (
			event.type === "item.completed" &&
			event.item?.type === "agent_message" &&
			typeof event.item.text === "string"
		)
			text = event.item.text;
	}
	if (!text.trim()) throw new Error("AI 未返回可用内容，请重新发起。");
	return text;
}
export async function runAgent(options: {
	provider: AgentProvider;
	prompt: string;
	signal?: AbortSignal;
	cwd: string;
	onStatus?: (message: string) => void;
}): Promise<string> {
	if (options.signal?.aborted) throw new Error("已取消生成。");
	if (!["codex", "claude"].includes(options.provider))
		throw new Error("请先选择 AI 工具。");
	const executable = await locate(options.provider);
	if (!executable) throw new Error("未找到所选 AI 工具，请先安装并登录。");
	options.onStatus?.("正在生成，请稍候…");
	const output = await runProcess(
		executable,
		options.provider === "claude" ? claudeArguments() : codexArguments(),
		{ cwd: options.cwd, input: options.prompt, signal: options.signal },
	);
	return options.provider === "claude"
		? parseClaudeResult(output)
		: parseCodexResult(output);
}
