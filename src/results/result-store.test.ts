import { beforeEach, afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createResultStore, type Result } from "./result-store";
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

it("keeps source identity separate from layout and restores the previous result", async () => {
	const store = createResultStore(root);
	const original = "用户原文";
	const first = await store.capture({
		markdown: original,
		sourcePath: "文章.md",
		assets: [],
	});
	const firstResult = await store.present(
		first.requestId,
		await candidate(first),
		original,
	);
	const next = await store.capture({
		markdown: "排版稿",
		sourceMarkdown: original,
		sourcePath: "文章.md",
		assets: [],
	} as any);
	await store.present(
		next.requestId,
		await candidate(next, "<p>增强</p>"),
		original,
	);
	expect((await store.current("文章.md", original))?.state).toBe("current");
	expect((await store.current("文章.md", original))?.markdownFile).toMatch(
		/layout\.md$/,
	);
	await store.restorePrevious("文章.md", original);
	expect((await store.current("文章.md", original))?.id).toBe(firstResult.id);
	expect((await store.current("文章.md", "已修改"))?.state).toBe(
		"source_changed",
	);
});

it.each(["markdown", "html", "asset", "missing"])(
	"keeps current result when previous %s is damaged",
	async (damage) => {
		const store = createResultStore(root);
		const image = join(root, "source.png");
		await writeFile(image, "image bytes");
		const markdown = "![图](source.png)";
		const first = await store.capture({
			markdown,
			sourcePath: "文章.md",
			assets: [
				{
					tokenStart: 5,
					tokenEnd: 15,
					originalTarget: "source.png",
					localFile: image,
				},
			],
		});
		const previous = (await store.present(
			first.requestId,
			await candidate(first),
			markdown,
		)) as Result;
		const next = await store.capture({
			markdown,
			sourcePath: "文章.md",
			assets: [],
		});
		const current = await store.present(
			next.requestId,
			await candidate(next, "<p>新版</p>"),
			markdown,
		);
		const file =
			damage === "asset"
				? previous.assets[0]!.localFile
				: damage === "html"
					? previous.htmlFile
					: previous.markdownFile;
		if (damage === "missing") await rm(file);
		else await writeFile(file, "changed");
		await expect(
			store.restorePrevious("文章.md", markdown),
		).rejects.toThrow();
		expect((await store.current("文章.md", markdown))?.id).toBe(current.id);
	},
);

it("refuses to overwrite another article's stored layout on rename", async () => {
	const store = createResultStore(root);
	for (const sourcePath of ["旧.md", "已有.md"]) {
		const request = await store.capture({
			markdown: sourcePath,
			sourcePath,
			assets: [],
		});
		await store.present(
			request.requestId,
			await candidate(request),
			sourcePath,
		);
	}
	const old = await store.current("旧.md", "旧.md");
	const target = await store.current("已有.md", "已有.md");
	await expect(store.renameSource("旧.md", "已有.md")).rejects.toThrow();
	expect((await store.current("旧.md", "旧.md"))?.id).toBe(old?.id);
	expect((await store.current("已有.md", "已有.md"))?.id).toBe(target?.id);
	await store.renameSource("旧.md", "旧.md");
	expect((await store.current("旧.md", "旧.md"))?.id).toBe(old?.id);
});

it("invalidates a pending task when restoring the previous layout", async () => {
	const store = createResultStore(root);
	for (const html of ["<p>第一版</p>", "<p>第二版</p>"]) {
		const request = await store.capture({
			markdown: "原文",
			sourcePath: "文章.md",
			assets: [],
		});
		await store.present(
			request.requestId,
			await candidate(request, html),
			"原文",
		);
	}
	const pending = await store.capture({
		markdown: "原文",
		sourcePath: "文章.md",
		assets: [],
	});
	const restored = await store.restorePrevious("文章.md", "原文");
	expect(
		await store.present(
			pending.requestId,
			await candidate(pending, "<p>晚到结果</p>"),
			"原文",
		),
	).toEqual({ state: "superseded" });
	expect((await store.current("文章.md", "原文"))?.id).toBe(restored?.id);
});
it("persists enhancement changes with the adopted result, without a sidecar file", async () => {
	const store = createResultStore(root);
	const request = await store.capture({
		markdown: "原文",
		sourcePath: "文章.md",
		assets: [],
	});
	const changes = [
		{
			original: "原文",
			replacement: ":::quote\nquote: 原文\n:::",
			reason: "突出重点",
			kind: "quote" as const,
		},
	];
	const result = await store.present(
		request.requestId,
		{ ...(await candidate(request)), changes },
		"原文",
	);
	expect(result.state).toBe("current");
	const restored = (await createResultStore(root).current(
		"文章.md",
		"原文",
	)) as Result;
	expect(restored.changes).toEqual(changes);
	const stored = JSON.parse(
		await readFile(
			join(root, "results", restored.id, "result.json"),
			"utf8",
		),
	);
	expect(stored.changes).toEqual(changes);
	await expect(
		readFile(join(root, "results", restored.id, "changes.json")),
	).rejects.toMatchObject({ code: "ENOENT" });
});
it("keeps historical result identity aligned with a renamed article", async () => {
	const store = createResultStore(root);
	const request = await store.capture({
		sourcePath: "旧/文.md",
		markdown: "原文",
		assets: [],
	});
	const result = (await store.present(
		request.requestId,
		await candidate(request),
		"原文",
	)) as Result;
	await store.renameSource("旧/文.md", "新/文.md");
	expect((await store.current("新/文.md", "原文"))?.sourcePath).toBe(
		"新/文.md",
	);
	expect(
		JSON.parse(
			await readFile(
				join(root, "results", result.id, "result.json"),
				"utf8",
			),
		).sourcePath,
	).toBe("新/文.md");
});
