import { expect, test } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeCliRunner } from "../cli/runner";
import { titlePrompt, titleStyles } from "./title-request";

test("every visible title style prepares a real CLI request without generating", async () => {
	const dir = await mkdtemp(join(tmpdir(), "title-styles-"));
	try {
		const file = join(dir, "article.md");
		await writeFile(file, "# 每日记录\n\n每天记录一个小进步，周末回顾。");
		for (const style of titleStyles) {
			const prompt = await titlePrompt(
				new NodeCliRunner("md2wechat"),
				file,
				style.value,
			);
			expect(prompt).toContain("每天记录一个小进步");
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("does not misreport invalid title options as a missing installation", async () => {
	const runner = {
		run: async () => ({ success: false, code: "TITLE_SUGGEST_INVALID" }),
	} as any;
	await expect(titlePrompt(runner, "article.md", 7)).rejects.toThrow(
		"标题风格不受支持",
	);
});
