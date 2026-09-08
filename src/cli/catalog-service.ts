import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { CliEnvelope, CliRunner } from "./contracts";
export function completed<T>(result: CliEnvelope<T>): T {
	if (!result.success || result.status !== "completed")
		throw new Error(result.message || "操作未完成");
	return result.data;
}
export type Theme = {
	name: string;
	description: string;
	type: string;
	selectable: boolean;
};
export type Account = { name: string; appid: string; current: boolean };
export async function locateCli(configured = "") {
	if (configured) {
		await access(configured, constants.X_OK);
		return configured;
	}
	const candidates = [
		...(process.env.PATH ?? "")
			.split(delimiter)
			.filter(Boolean)
			.map((p) =>
				join(
					p,
					process.platform === "win32"
						? "md2wechat.exe"
						: "md2wechat",
				),
			),
		"/opt/homebrew/bin/md2wechat",
		"/usr/local/bin/md2wechat",
	];
	for (const file of candidates) {
		try {
			await access(file, constants.X_OK);
			return file;
		} catch {
			/* Continue to the next actual installation. */
		}
	}
	throw new Error("没有找到 md2wechat，请先安装，或在插件设置中选择它的位置");
}
export class CatalogService {
	constructor(private runner: CliRunner) {}
	async load() {
		const capability = completed(
			await this.runner.run<{
				commands: string[];
				convert: { default_theme: string };
			}>(["capabilities", "--json"]),
		);
		if (
			!["preview", "inspect"].every((c) =>
				capability.commands.includes(c),
			)
		)
			throw new Error("当前 md2wechat 缺少预览能力");
		const data = completed(
			await this.runner.run<{ themes: Theme[] }>([
				"themes",
				"list",
				"--json",
			]),
		);
		return {
			commands: capability.commands,
			defaultTheme: capability.convert.default_theme,
			themes: data.themes.filter((t) => t.type === "api" && t.selectable),
		};
	}
	async accounts(): Promise<Account[]> {
		const data = completed(
			await this.runner.run<{
				accounts: Account[];
				current: Account | null;
			}>(["config", "wechat-accounts", "--json"]),
		);
		const accounts = data.accounts.filter((a) => a.appid);
		if (
			data.current?.appid &&
			!accounts.some((a) => a.appid === data.current!.appid)
		)
			accounts.push(data.current);
		return accounts;
	}
}
