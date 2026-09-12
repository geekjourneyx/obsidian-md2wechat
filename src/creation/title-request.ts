import type { CliRunner } from "../cli/contracts";

export const titleStyles = [
	{ value: 1, label: "清楚克制" },
	{ value: 2, label: "更有吸引力" },
];

export async function titlePrompt(
	runner: CliRunner,
	file: string,
	hook: number,
	signal?: AbortSignal,
): Promise<string> {
	const response = await runner.run<any>(
		["title", "suggest", file, "--hook-level", String(hook), "--json"],
		{ signal },
	);
	if (!response.success) {
		if (response.code === "CLI_NOT_FOUND")
			throw new Error("未找到 md2wechat，请检查安装位置");
		if (response.code === "CLI_ABORTED") throw new Error("已取消生成");
		if (response.code === "CLI_TIMEOUT")
			throw new Error("标题准备超时，请重试");
		if (response.code === "TITLE_SUGGEST_INVALID")
			throw new Error("标题风格不受支持，请更新插件后重试");
		throw new Error("标题生成未能开始，请重试");
	}
	if (
		typeof response.data?.prompt !== "string" ||
		!response.data.prompt.trim()
	)
		throw new Error("未收到标题生成要求，请更新 md2wechat 后重试");
	return response.data.prompt;
}
