import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createResultStore } from "../results/result-store";
import { createCreationStore, selectedTitle } from "./creation-store";
import { renameResources } from "./rename-resources";
let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "rename-resources-"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});
it("moves folder descendants and their cover paths without touching similarly named siblings", async () => {
	const results = createResultStore(root),
		creation = createCreationStore(join(root, "creation"));
	await results.capture({
		sourcePath: "旧/子/文.md",
		markdown: "原文",
		assets: [],
	});
	await creation.addTitles("旧/子/文.md", "hash", ["保留标题"]);
	await creation.setCoverPath("旧/子/文.md", "旧/附件/封面.png");
	await creation.setCoverPath("其他.md", "旧/附件/共享.png");
	await creation.addTitles("旧稿/文.md", "hash", ["不动"]);
	await renameResources(results, creation, "旧", "新");
	expect((await creation.read("新/子/文.md")).titles[0].items[0].text).toBe(
		"保留标题",
	);
	expect((await creation.read("新/子/文.md")).coverPath).toBe(
		"新/附件/封面.png",
	);
	expect((await creation.read("其他.md")).coverPath).toBe("新/附件/共享.png");
	expect((await creation.read("旧稿/文.md")).titles[0].items[0].text).toBe(
		"不动",
	);
	expect(await results.sourcePaths()).toContain("新/子/文.md");
	expect(await results.sourcePaths()).not.toContain("旧/子/文.md");
});
it("preflights both stores before moving any article", async () => {
	const results = createResultStore(root),
		creation = createCreationStore(join(root, "creation"));
	await results.capture({
		sourcePath: "旧.md",
		markdown: "原文",
		assets: [],
	});
	await creation.addTitles("旧.md", "hash", ["原标题"]);
	await creation.addTitles("新.md", "hash", ["不能覆盖"]);
	await expect(
		renameResources(results, creation, "旧.md", "新.md"),
	).rejects.toThrow("不能覆盖");
	expect(await results.sourcePaths()).toContain("旧.md");
	expect((await creation.read("旧.md")).titles[0].items[0].text).toBe(
		"原标题",
	);
});
it("rolls the first store back when the second store cannot move", async () => {
	const results = createResultStore(root),
		creation = createCreationStore(join(root, "creation"));
	await results.capture({
		sourcePath: "旧.md",
		markdown: "原文",
		assets: [],
	});
	await creation.addTitles("旧.md", "hash", ["标题"]);
	const failure = {
		...creation,
		renameSource: async () => {
			throw new Error("模拟写入失败");
		},
	};
	await expect(
		renameResources(results, failure, "旧.md", "新.md"),
	).rejects.toThrow("未迁移");
	expect(await results.sourcePaths()).toContain("旧.md");
	expect(await results.sourcePaths()).not.toContain("新.md");
	expect((await creation.read("旧.md")).titles).toHaveLength(1);
});
it("serializes rapid successive folder renames", async () => {
	const results = createResultStore(root),
		creation = createCreationStore(join(root, "creation"));
	await results.capture({
		sourcePath: "甲/文.md",
		markdown: "原文",
		assets: [],
	});
	await creation.setCoverPath("甲/文.md", "甲/图.png");
	await Promise.all([
		renameResources(results, creation, "甲", "乙"),
		renameResources(results, creation, "乙", "丙"),
	]);
	expect(await results.sourcePaths()).toEqual(["丙/文.md"]);
	expect((await creation.read("丙/文.md")).coverPath).toBe("丙/图.png");
});
it("does not combine one article choices with another article layout", async () => {
	const results = createResultStore(root),
		creation = createCreationStore(join(root, "creation"));
	await creation.addTitles("旧.md", "hash", ["旧文章标题"]);
	await results.capture({
		sourcePath: "新.md",
		markdown: "另一文章",
		assets: [],
	});
	await expect(
		renameResources(results, creation, "旧.md", "新.md"),
	).rejects.toThrow("不能覆盖");
	expect((await creation.read("旧.md")).titles).toHaveLength(1);
	expect((await creation.read("新.md")).titles).toHaveLength(0);
});
it("moves saved paragraph images for descendants and other articles sharing the folder", async () => {
	const results = createResultStore(root),
		creation = createCreationStore(join(root, "creation"));
	const generated = join(root, "generated.png");
	for (const source of ["旧/文.md", "其他.md", "旧稿/文.md"]) {
		const state = await creation.addIllustrations(source, "hash", [
			{ file: generated, label: "配图" },
		]);
		await creation.saveIllustrationPath(
			source,
			state.illustrations![0].items[0].id,
			source === "旧稿/文.md" ? "旧稿/图片.png" : "旧/附件/共享.png",
		);
	}
	await renameResources(results, creation, "旧", "新");
	for (const source of ["新/文.md", "其他.md"]) {
		const image = (await creation.read(source)).illustrations![0].items[0];
		expect(image.savedPath).toBe("新/附件/共享.png");
		expect(image.file).toBe(generated);
	}
	expect(
		(await creation.read("旧稿/文.md")).illustrations![0].items[0]
			.savedPath,
	).toBe("旧稿/图片.png");
});
