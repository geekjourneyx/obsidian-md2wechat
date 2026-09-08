import { beforeEach, afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createResultStore } from "./result-store";
let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "md2wechat-results-"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});
async function candidate(request: any, html = "<p>已审阅</p>") {
	const files = {
		markdown: join(request.workDir, "formatted.md"),
		preview: join(request.workDir, "preview.html"),
		response: join(request.workDir, "preview-response.json"),
	};
	await writeFile(files.markdown, "# 标题");
	await writeFile(files.preview, html);
	await writeFile(
		files.response,
		JSON.stringify({
			success: true,
			status: "completed",
			schema_version: "v1",
			code: "PREVIEW_READY",
			data: {
				output_file: files.preview,
				inspect: { source_file: files.markdown },
				render: { exact_html: true, mode: "api" },
			},
		}),
	);
	return files;
}
it("restores adopted HTML after restart and keeps it when source changes", async () => {
	const store = createResultStore(root);
	const request = await store.capture({
		markdown: "原文",
		sourcePath: "文章.md",
		assets: [],
	});
	await store.present(request.requestId, await candidate(request), "原文");
	const restored = createResultStore(root);
	const result = await restored.current("文章.md", "更新");
	expect(result?.state).toBe("source_changed");
	expect(await readFile(result!.htmlFile, "utf8")).toBe("<p>已审阅</p>");
});
it("does not adopt a late response from an older request", async () => {
	const store = createResultStore(root);
	const old = await store.capture({
		markdown: "原文",
		sourcePath: "文章.md",
		assets: [],
	});
	const newer = await store.capture({
		markdown: "原文",
		sourcePath: "文章.md",
		assets: [],
	});
	await store.present(
		newer.requestId,
		await candidate(newer, "<p>new</p>"),
		"原文",
	);
	expect(
		(
			await store.present(
				old.requestId,
				await candidate(old, "<p>old</p>"),
				"原文",
			)
		).state,
	).toBe("superseded");
	expect(
		await readFile(
			(await store.current("文章.md", "原文"))!.htmlFile,
			"utf8",
		),
	).toBe("<p>new</p>");
});
it("rejects files outside the request and incomplete preview responses", async () => {
	const store = createResultStore(root);
	const request = await store.capture({
		markdown: "原文",
		sourcePath: "文章.md",
		assets: [],
	});
	const files = await candidate(request);
	await expect(
		store.present(
			request.requestId,
			{ ...files, preview: join(root, "elsewhere.html") },
			"原文",
		),
	).rejects.toThrow();
	await writeFile(
		files.response,
		JSON.stringify({
			success: true,
			status: "action_required",
			data: { output_file: files.preview },
		}),
	);
	await expect(
		store.present(request.requestId, files, "原文"),
	).rejects.toThrow();
	expect(await store.current("文章.md", "原文")).toBeNull();
});
it("is idempotent and retains a previous result without trusting edited request manifests", async () => {
	const store = createResultStore(root);
	const request = await store.capture({
		markdown: "原文",
		sourcePath: "文章.md",
		assets: [],
	});
	const files = await candidate(request);
	const first = await store.present(request.requestId, files, "原文");
	const second = await store.present(request.requestId, files, "原文");
	expect(second.id).toBe(first.id);
	const next = await store.capture({
		markdown: "新文",
		sourcePath: "文章.md",
		assets: [],
	});
	await store.present(
		next.requestId,
		await candidate(next, "<p>新文</p>"),
		"新文",
	);
	expect(await readFile(first.htmlFile!, "utf8")).toBe("<p>已审阅</p>");
});
