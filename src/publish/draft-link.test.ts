import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash } from "../results/result-store";
import { draftLink, completedDraft } from "./draft-link";
test("only real HTTPS WeChat links are offered as direct draft links", () => {
	expect(draftLink("https://mp.weixin.qq.com/s/real").label).toBe("查看草稿");
	for (const value of [
		undefined,
		"media-id",
		"javascript:alert(1)",
		"https://mp.weixin.qq.com.evil.test/",
		"https://user:secret@mp.weixin.qq.com/",
	])
		expect(draftLink(value)).toEqual({
			url: "https://mp.weixin.qq.com/",
			label: "打开公众号后台",
		});
});
test("completed receipts survive reopening and stay bound to article and account", async () => {
	const root = await mkdtemp(join(tmpdir(), "draft-link-"));
	await mkdir(join(root, "attempts"));
	const file = join(root, "attempts", hash("article:account") + ".json");
	await writeFile(
		file,
		JSON.stringify({ state: "completed", mediaId: "existing" }),
	);
	expect((await completedDraft(root, "article", "account"))?.label).toBe(
		"打开公众号后台",
	);
	expect(await completedDraft(root, "other", "account")).toBeNull();
	expect(await completedDraft(root, "article", "other")).toBeNull();
	await writeFile(
		file,
		JSON.stringify({ state: "unknown", mediaId: "existing" }),
	);
	expect(await completedDraft(root, "article", "account")).toBeNull();
});

test("article history survives new previews and stays separate from other documents", async () => {
	const { articleDraft } = await import("./draft-link");
	const root = await mkdtemp(join(tmpdir(), "article-draft-"));
	await mkdir(join(root, "attempts"));
	await mkdir(join(root, "results", "old"), { recursive: true });
	await writeFile(
		join(root, "results", "old", "result.json"),
		JSON.stringify({ id: "old", sourcePath: "article.md" }),
	);
	await writeFile(
		join(root, "attempts", hash("old:account") + ".json"),
		JSON.stringify({ state: "completed", mediaId: "real" }),
	);
	const current = {
		id: "new",
		sourcePath: "article.md",
		state: "current",
	} as any;
	expect((await articleDraft(root, current, "account"))?.current).toBe(false);
	expect(
		await articleDraft(
			root,
			{ ...current, sourcePath: "other.md" },
			"account",
		),
	).toBeNull();
	expect(await articleDraft(root, current, "other-account")).toBeNull();
	expect(
		(await articleDraft(root, { ...current, id: "old" }, "account"))
			?.current,
	).toBe(false);
	expect(
		(
			await articleDraft(
				root,
				{ ...current, id: "old", state: "source_changed" },
				"account",
			)
		)?.current,
	).toBe(false);
});
