import { afterEach, beforeEach, expect, it } from "vitest";
import {
	mkdtemp,
	mkdir,
	readFile,
	writeFile,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageSource } from "./stage-source";
let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "md2wechat-stage-"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});
it("stages the supplied editor content and only replaces the identified image target", async () => {
	const source = join(root, "文章.md");
	const asset = join(root, "图片 一.png");
	await writeFile(source, "DISK");
	await writeFile(asset, "image bytes");
	const markdown =
		"BUFFER\n![图](图片%20一.png)\n```md\n![示例](图片%20一.png)\n```";
	const target = "图片%20一.png";
	const start = markdown.indexOf(target);
	const result = await stageSource(
		{
			markdown,
			sourcePath: source,
			assets: [
				{
					tokenStart: start,
					tokenEnd: start + target.length,
					originalTarget: target,
					localFile: asset,
				},
			],
		},
		join(root, "work"),
	);
	expect(await readFile(result.inputFile, "utf8")).toBe(
		"BUFFER\n![图](assets/asset-1.png)\n```md\n![示例](图片%20一.png)\n```",
	);
	expect(await readFile(source, "utf8")).toBe("DISK");
	expect(
		await readFile(join(result.workDir, "assets/asset-1.png"), "utf8"),
	).toBe("image bytes");
});
it("rejects stale token positions instead of corrupting the editor content", async () => {
	await expect(
		stageSource(
			{
				markdown: "new content",
				sourcePath: "a.md",
				assets: [
					{
						tokenStart: 0,
						tokenEnd: 3,
						originalTarget: "old",
						localFile: "/unused",
					},
				],
			},
			join(root, "work"),
		),
	).rejects.toThrow(/位置/);
});
it("does not overwrite an existing work directory or follow its symlink", async () => {
	const real = join(root, "real");
	await mkdir(real);
	await writeFile(join(real, "input.md"), "KEEP");
	await symlink(real, join(root, "work"));
	await expect(
		stageSource(
			{ markdown: "new", sourcePath: "a.md", assets: [] },
			join(root, "work"),
		),
	).rejects.toThrow();
	expect(await readFile(join(real, "input.md"), "utf8")).toBe("KEEP");
});
it("rejects overlapping replacements and missing images", async () => {
	const a = {
		tokenStart: 0,
		tokenEnd: 2,
		originalTarget: "aa",
		localFile: join(root, "missing.png"),
	};
	await expect(
		stageSource(
			{
				markdown: "aaa",
				sourcePath: "a.md",
				assets: [a, { ...a, tokenStart: 1, tokenEnd: 3 }],
			},
			join(root, "overlap"),
		),
	).rejects.toThrow(/位置/);
	await expect(
		stageSource(
			{ markdown: "aa", sourcePath: "a.md", assets: [a] },
			join(root, "missing"),
		),
	).rejects.toThrow();
});
