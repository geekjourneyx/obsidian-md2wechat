import { test, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "parse5";
import { applyEnhancements, type LayoutKind } from "./layout-engine";
import { cliEnvironment } from "../cli/environment";

// Explicit opt-in: uses the real configured rendering service, never uploads images or creates drafts.
test.runIf(process.env.MD2WECHAT_LIVE_LAYOUT_TEST === "1")(
	"real CLI renders all five modules without leaking authoring fields",
	async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "md2wechat-module-render-"),
		);
		const samples: Array<{
			kind: LayoutKind;
			source: string;
			visible: string[];
		}> = [
			{
				kind: "callout",
				source: "每天记录一个进步。",
				visible: ["每天记录一个进步。"],
			},
			{
				kind: "quote",
				source: "阅读帮助我们理解世界。",
				visible: ["阅读帮助我们理解世界。"],
			},
			{
				kind: "checklist",
				source: "- 检查图片\n- 核对标题",
				visible: ["检查图片", "核对标题"],
			},
			{
				kind: "steps",
				source: "1. 检查配置：确认有效。\n2. 生成预览：查看效果。",
				visible: ["检查配置", "确认有效。", "生成预览", "查看效果。"],
			},
			{
				kind: "compare",
				source: "| 旧方式 | 新方式 |\n| --- | --- |\n| 手动：逐项复制。 | 自动：确认后插入。 |",
				visible: [
					"旧方式",
					"新方式",
					"手动",
					"逐项复制。",
					"自动",
					"确认后插入。",
				],
			},
		];
		try {
			const markdown = samples
				.map(
					(s) =>
						applyEnhancements(s.source, [
							{ index: 0, kind: s.kind, reason: "验证" },
						]).markdown,
				)
				.join("\n\n");
			const file = join(directory, "layout.md"),
				output = join(directory, "preview.html");
			await writeFile(file, markdown);
			const checked = await promisify(execFile)(
				"md2wechat",
				["layout", "validate", "--file", file, "--json"],
				{
					env: cliEnvironment("md2wechat"),
					timeout: 60000,
					maxBuffer: 1024 * 1024,
				},
			);
			expect(JSON.parse(checked.stdout).success).toBe(true);
			const { stdout } = await promisify(execFile)(
				"md2wechat",
				[
					"preview",
					file,
					"--theme",
					"default",
					"--output",
					output,
					"--json",
				],
				{
					env: cliEnvironment("md2wechat"),
					timeout: 60000,
					maxBuffer: 1024 * 1024,
				},
			);
			expect(JSON.parse(stdout).success).toBe(true);
			const document = parse(await readFile(output, "utf8"));
			const visible = (node: any): string =>
				["style", "script"].includes(node.tagName)
					? ""
					: node.nodeName === "#text"
						? node.value
						: (node.childNodes ?? []).map(visible).join(" ");
			const text = visible(document);
			for (const sample of samples)
				for (const value of sample.visible)
					expect(text).toContain(value);
			expect(text).not.toMatch(
				/type:\s*info|body:|quote:|pending\s*\||:::(?:callout|quote|steps|compare|checklist)/,
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	70000,
);
