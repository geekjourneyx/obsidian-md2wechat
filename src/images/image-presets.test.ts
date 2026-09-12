import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { parseImagePresets, imagePresetsFor } from "./image-presets";
test("discovers real presets, including compatible covers and all body styles with Chinese labels", () => {
	const response = JSON.parse(
		execFileSync(
			"md2wechat",
			["prompts", "list", "--kind", "image", "--json"],
			{ encoding: "utf8" },
		),
	);
	const presets = parseImagePresets(response.data);
	expect(presets).toHaveLength(25);
	expect(imagePresetsFor(presets, "cover")).toHaveLength(14);
	expect(imagePresetsFor(presets, "body")).toHaveLength(25);
	expect(imagePresetsFor(presets, "body")[0].archetype).toBe("infographic");
	expect(
		imagePresetsFor(presets, "cover").find(
			(p) => p.id === "infographic-apple-keynote-premium",
		)?.label,
	).toBe("信息图 · 苹果发布会");
	expect(
		presets.find((p) => p.id === "infographic-handdrawn-sketchnote")?.label,
	).toBe("信息图 · 手绘笔记");
	expect(
		presets.every((p) => p.description && /[\u4e00-\u9fff]/.test(p.label)),
	).toBe(true);
});
test("rejects malformed payloads and ignores non-image entries", () => {
	expect(() => parseImagePresets({ prompts: "wrong" })).toThrow();
	expect(
		parseImagePresets({ prompts: [{ name: "other", kind: "title" }] }),
	).toEqual([]);
});
test("renders handdrawn and Apple plans from the same real paragraph without generation", async () => {
	const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = await mkdtemp(join(tmpdir(), "image-style-plan-"));
	try {
		const article = join(dir, "paragraph.md");
		await writeFile(
			article,
			"# 每日记录\n\n每天记录一个小进步，周末回顾。",
		);
		const prompts = [];
		for (const preset of [
			"infographic-handdrawn-sketchnote",
			"infographic-apple-keynote-premium",
		]) {
			const result = JSON.parse(
				execFileSync(
					"md2wechat",
					[
						"generate_image",
						"--preset",
						preset,
						"--article",
						article,
						"--plan",
						"--json",
					],
					{ encoding: "utf8" },
				),
			);
			expect(result.code).toBe("IMAGE_PLAN_READY");
			expect(result.data.side_effects).toBe(false);
			expect(result.data.preset).toBe(preset);
			expect(result.data.prompt).toContain("每天记录一个小进步");
			prompts.push(result.data.prompt);
		}
		expect(prompts[0]).not.toBe(prompts[1]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
