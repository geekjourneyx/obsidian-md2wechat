import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCreationStore, selectedTitle } from "./creation-store";
let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "creation-store-"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});
it("retains selection across new batches and restart, independently per article", async () => {
	const store = createCreationStore(root);
	let state = await store.addTitles("甲.md", "hash1", [
		"标题一",
		"标题一",
		"标题二",
	]);
	expect(state.titles[0]!.items).toHaveLength(2);
	expect(state.selectedTitle).toBeUndefined();
	await store.selectTitle("甲.md", state.titles[0]!.items[1]!.id);
	await store.addTitles("甲.md", "hash2", ["新版"]);
	state = await createCreationStore(root).read("甲.md");
	expect(selectedTitle(state)).toBe("标题二");
	expect(state.titles.map((b) => b.sourceHash)).toEqual(["hash1", "hash2"]);
	expect(await store.read("乙.md")).toEqual({ titles: [], covers: [] });
});
it("serializes concurrent updates across store instances", async () => {
	await Promise.all(
		Array.from({ length: 30 }, (_, i) =>
			createCreationStore(root).addTitles("文章.md", "hash", [
				`标题 ${i}`,
			]),
		),
	);
	expect(
		(await createCreationStore(root).read("文章.md")).titles,
	).toHaveLength(30);
	expect((await readdir(root)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
});
it("retains cover and title selections when invalid selections or paths fail", async () => {
	const store = createCreationStore(root);
	const first = await store.addCovers("文章.md", "hash", [
		{ file: join(root, "cover.png"), label: "封面" },
	]);
	const id = first.covers[0]!.items[0]!.id;
	await store.selectCover("文章.md", id, "附件/中文 封面.png");
	await store.addCovers("文章.md", "hash", [
		{ file: join(root, "second.png"), label: "第二张" },
	]);
	for (const path of [
		"../escape.png",
		"/outside.png",
		"C:/outside.png",
		"附件/../escape.png",
		"附件\\escape.png",
	])
		await expect(store.selectCover("文章.md", id, path)).rejects.toThrow();
	await expect(
		store.selectCover("文章.md", "missing", "ok.png"),
	).rejects.toThrow();
	await expect(store.selectTitle("文章.md", "missing")).rejects.toThrow();
	expect((await store.read("文章.md")).coverPath).toBe("附件/中文 封面.png");
	expect((await store.read("文章.md")).selectedCover).toBe(id);
	await expect(
		store.addCovers("文章.md", "hash", [
			{ file: "/tmp/../outside.png", label: "bad" },
		]),
	).rejects.toThrow();
});
it("updates renamed articles and assets without overwriting another article", async () => {
	const store = createCreationStore(root);
	await store.addTitles("原.md", "hash", ["原标题"]);
	await store.setCoverPath("原.md", "附件/old.png");
	await store.addTitles("已有.md", "hash", ["保留"]);
	await expect(store.renameSource("原.md", "已有.md")).rejects.toThrow();
	await store.renameSource("原.md", "新.md");
	await store.renameAsset("附件/old.png", "新附件/new.png");
	expect((await store.read("新.md")).coverPath).toBe("新附件/new.png");
	expect((await store.read("原.md")).titles).toEqual([]);
	expect((await store.read("已有.md")).titles[0]!.items[0]!.text).toBe(
		"保留",
	);
});
it("rejects oversized or corrupted data without discarding records", async () => {
	const store = createCreationStore(root);
	await expect(
		store.addTitles("文章.md", "hash", ["长".repeat(33)]),
	).rejects.toThrow();
	await expect(
		store.addTitles("../文章.md", "hash", ["标题"]),
	).rejects.toThrow();
	await expect(
		store.addTitles(
			"文章.md",
			"hash",
			Array.from({ length: 21 }, (_, i) => `${i}`),
		),
	).rejects.toThrow();
	await store.addTitles("文章.md", "hash", ["标题"]);
	const file = (await readdir(root))[0]!;
	await writeFile(join(root, file), "{}");
	await expect(store.read("文章.md")).rejects.toThrow();
});
it("renames the selected saved cover without altering its generated candidate or selection", async () => {
	const store = createCreationStore(root);
	const generated = join(root, "candidate.png");
	const state = await store.addCovers("文章.md", "hash", [
		{ file: generated, label: "封面" },
	]);
	const id = state.covers[0]!.items[0]!.id;
	await store.selectCover("文章.md", id, "附件/旧封面.png");
	await store.renameAsset("附件/旧封面.png", "新附件/新封面.png");
	const restored = await createCreationStore(root).read("文章.md");
	expect(restored.selectedCover).toBe(id);
	expect(restored.coverPath).toBe("新附件/新封面.png");
	expect(restored.covers[0]!.items[0]).toEqual({
		id,
		label: "封面",
		file: generated,
		savedPath: "新附件/新封面.png",
	});
});
it("keeps successful partial batches and selection when a later batch fails", async () => {
	const store = createCreationStore(root);
	const first = await store.addCovers("文章.md", "hash", [
		{ file: join(root, "first.png"), label: "已选" },
	]);
	const id = first.covers[0]!.items[0]!.id;
	await store.selectCover("文章.md", id, "附件/已选.png");
	// The generator supplies completed images only when some requested images fail.
	await store.addCovers("文章.md", "hash", [
		{ file: join(root, "partial.png"), label: "本批成功的一张" },
	]);
	await expect(store.addCovers("文章.md", "hash", [])).rejects.toThrow();
	await expect(
		store.addCovers("文章.md", "hash", [
			{ file: join(root, "valid.png"), label: "尚未保存" },
			{ file: "../invalid.png", label: "无效" },
		]),
	).rejects.toThrow();
	const restored = await store.read("文章.md");
	expect(restored.covers).toHaveLength(2);
	expect(restored.covers[1]!.items[0]!.label).toBe("本批成功的一张");
	expect(restored.selectedCover).toBe(id);
	expect(restored.coverPath).toBe("附件/已选.png");
});
it("restores paid paragraph images after restart, source changes and article rename", async () => {
	const store = createCreationStore(root);
	const first = await store.addIllustrations("文章.md", "old-source", [
		{ file: join(root, "one.png"), label: "配图 1" },
	]);
	const id = first.illustrations![0].items[0].id;
	await store.saveIllustrationPath("文章.md", id, "附件/one.png");
	await store.addIllustrations("文章.md", "new-source", [
		{ file: join(root, "two.png"), label: "配图 2" },
	]);
	await store.renameSource("文章.md", "目录/文章.md");
	await store.renameAsset("附件/one.png", "图片/one.png");
	const restored = await createCreationStore(root).read("目录/文章.md");
	expect(restored.illustrations!.map((batch) => batch.sourceHash)).toEqual([
		"old-source",
		"new-source",
	]);
	expect(restored.illustrations![0].items[0]).toMatchObject({
		id,
		savedPath: "图片/one.png",
	});
	expect((await store.read("其他.md")).illustrations).toBeUndefined();
});
