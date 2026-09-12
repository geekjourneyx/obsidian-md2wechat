import { expect, test } from "vitest";
import {
	layoutBlocks,
	applyEnhancements,
	parseAgentJSON,
} from "./layout-engine";

test("enhancement preserves prose while adding only a supported wrapper", () => {
	const source = "# 标题\n\n先检查配置，再开始操作。\n\n结尾。";
	const blocks = layoutBlocks(source);
	const first = blocks.find((b) => b.text === "先检查配置，再开始操作。")!;
	const result = applyEnhancements(source, [
		{ index: first.index, kind: "callout", reason: "操作提醒" },
	]);
	expect(result.markdown).toBe(
		"# 标题\n\n:::callout\n先检查配置，再开始操作。\n:::\n\n结尾。",
	);
	expect(result.changes[0].original).toBe(first.text);
	expect(source).not.toContain(":::");
});
test("never wraps code, metadata, image or module bodies", () => {
	const blocks = layoutBlocks(
		"---\ntitle: 资料\n---\n\n```md\n示例内容\n```\n\n![图](assets/a.png)\n\n:::quote\nquote: 已增强\n:::\n\n正常正文。",
	);
	expect(blocks.map((b) => b.text)).toEqual(["正常正文。"]);
});
test("rejects duplicate or unsuitable suggestions and permits zero enhancements", () => {
	expect(applyEnhancements("普通正文", []).markdown).toBe("普通正文");
	expect(() =>
		applyEnhancements("普通正文", [
			{ index: 0, kind: "steps", reason: "" },
		]),
	).toThrow();
	expect(() =>
		applyEnhancements("普通正文", [
			{ index: 0, kind: "quote", reason: "" },
			{ index: 0, kind: "callout", reason: "" },
		]),
	).toThrow();
	expect(() => parseAgentJSON("not json")).toThrow("没有返回");
});
test("steps use existing title and detail without inventing new words", () => {
	const source = "1. 检查配置：确认配置有效。\n2. 生成预览：查看文章效果。";
	const blocks = layoutBlocks(source);
	expect(blocks[0].kinds).toContain("steps");
	expect(
		applyEnhancements(source, [{ index: 0, kind: "steps", reason: "顺序" }])
			.markdown,
	).toContain("01 | 检查配置 | 确认配置有效。");
});

test("comparison uses existing table headers and cells without rewriting claims", () => {
	const source =
		"| 旧方式 | 新方式 |\n| --- | --- |\n| 手动：逐项复制。 | 自动：确认后插入。 |";
	const block = layoutBlocks(source)[0];
	expect(block.kinds).toContain("compare");
	const output = applyEnhancements(source, [
		{ index: block.index, kind: "compare", reason: "两种方案" },
	]).markdown;
	expect(output).toBe(
		":::compare[旧方式 | 新方式]\n手动 | 逐项复制。 | 自动 | 确认后插入。\n:::",
	);
});
