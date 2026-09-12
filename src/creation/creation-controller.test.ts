import { expect, test, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, FileSystemAdapter: class {} }));
import {
	titleTexts,
	replaceExact,
	imageInsertion,
} from "./creation-controller";
test("parses CLI title candidates without accepting arbitrary output", () => {
	expect(titleTexts('{"candidates":[{"title":"原文支持的标题"}]}')).toEqual([
		"原文支持的标题",
	]);
	expect(() => titleTexts('{"candidates":[]}')).toThrow();
});
test("local edits reject ambiguous or missing positions", () => {
	expect(replaceExact("a\n\nb", "a", "c")).toBe("c\n\nb");
	expect(() => replaceExact("重复\n重复", "重复", "改动")).toThrow();
	expect(() => replaceExact("已改", "旧段", "新段")).toThrow();
});
test("image insertions use an exact selected position and safe Markdown path", () => {
	expect(imageInsertion("首段\n\n末段", "首段", "图片/图 一.png")).toBe(
		"首段\n\n![配图](%E5%9B%BE%E7%89%87/%E5%9B%BE%20%E4%B8%80.png)\n\n末段",
	);
	expect(() => imageInsertion("正文", "正文", "../../outside.png")).toThrow();
});

vi.mock("../agent", () => ({ runAgent: vi.fn() }));
vi.mock("../images/local-generator", () => ({ generateLocalImage: vi.fn() }));
vi.mock("../cli/catalog-service", async (importOriginal) => ({
	...(await importOriginal<any>()),
	locateCli: vi.fn(async () => "md2wechat"),
}));
import { TFile } from "obsidian";
import { renameResources } from "./rename-resources";
import { CreationController } from "./creation-controller";
import { runAgent } from "../agent";
import { generateLocalImage } from "../images/local-generator";
import { createCreationStore } from "./creation-store";
import { hash, createResultStore } from "../results/result-store";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
	vi.clearAllMocks();
});
async function harness() {
	const root = await mkdtemp(join(tmpdir(), "creation-flow-"));
	roots.push(root);
	const source = { sourcePath: "文章.md", markdown: "原始段落" };
	const article = Object.assign(new TFile(), { path: "文章.md" });
	const plugin: any = {
		root,
		settings: { agent: "codex" },
		source: async () => source,
		store: createResultStore(join(root, "results")),
		creationStore: createCreationStore(join(root, "choices")),
		catalog: async () => ({ defaultTheme: "default" }),
		app: {
			vault: {
				getAbstractFileByPath: (path: string) =>
					path === article.path ? article : null,
			},
			metadataCache: { getFirstLinkpathDest: () => null },
		},
		refresh: () => {},
	};
	plugin.runner = async () => ({
		run: async (args: string[]) => {
			let data: any = {};
			if (args[0] === "preview") {
				const output = args[args.indexOf("--output") + 1]!;
				await writeFile(output, "<p>预览</p>");
				data = {
					output_file: output,
					render: { exact_html: true, mode: "api", theme: "default" },
					inspect: {
						source_file: args[1],
						context: { font_size: "medium" },
					},
				};
			}
			if (args[0] === "generate_cover")
				return { success: true, data: { prompt: "cover" } };
			return {
				success: true,
				status: "completed",
				schema_version: "v1",
				code: args[0] === "preview" ? "PREVIEW_READY" : "OK",
				data,
			};
		},
	});
	plugin.capture = async () =>
		plugin.store.capture({ ...source, assets: [] });
	plugin.creation = new CreationController(plugin);
	return plugin;
}
test("rejects a candidate prepared from a replaced adopted result", async () => {
	const p = await harness();
	const first = await p.creation.prepare("文章.md", "第一版");
	await p.creation.adopt(first);
	const candidate = await p.creation.prepare(
		"文章.md",
		"旧版修改",
		[],
		undefined,
		undefined,
		"原始段落",
		{ baseResultId: (await p.store.current("文章.md", "原始段落")).id },
	);
	const next = await p.creation.prepare("文章.md", "第二版");
	await p.creation.adopt(next);
	await expect(p.creation.adopt(candidate)).rejects.toThrow("成稿已更新");
	await expect(
		p.creation.prepare(
			"文章.md",
			"晚到修改",
			[],
			undefined,
			undefined,
			"原始段落",
			{ baseResultId: first.request.requestId },
		),
	).rejects.toThrow("成稿已更新");
});
test("initial enhancement prepares a candidate without adopting basic layout", async () => {
	const p = await harness();
	vi.mocked(runAgent).mockResolvedValue(
		'{"edits":[{"index":0,"kind":"quote","reason":"突出重点"}]}',
	);
	const candidate = await p.creation.enhance("文章.md");
	expect(candidate.markdown).toContain(":::quote");
	expect(await p.store.current("文章.md", "原始段落")).toBeNull();
	await p.creation.adopt(candidate);
	expect(await p.store.current("文章.md", "原始段落")).not.toBeNull();
});
test("keeps both successful covers together and retains partial successes", async () => {
	const p = await harness();
	vi.mocked(generateLocalImage)
		.mockResolvedValueOnce("/tmp/one.png")
		.mockResolvedValueOnce("/tmp/two.png");
	let result = await p.creation.covers("文章.md", "cover-default");
	expect(result.state.covers).toHaveLength(1);
	expect(result.state.covers[0].items).toHaveLength(2);
	vi.mocked(generateLocalImage)
		.mockResolvedValueOnce("/tmp/partial.png")
		.mockRejectedValueOnce(new Error("failure"));
	result = await p.creation.covers("文章.md", "cover-default");
	expect(result.state.covers).toHaveLength(2);
	expect(result.state.covers[1].items).toHaveLength(1);
});
test("rerenders an adopted image using its frozen asset rather than source lookup", async () => {
	const p = await harness();
	const image = join(p.root, "generated.png");
	await writeFile(image, "image");
	const request = await p.store.capture({
		sourcePath: "文章.md",
		sourceMarkdown: "原始段落",
		markdown: "![图](generated.png)",
		assets: [
			{
				tokenStart: 5,
				tokenEnd: 18,
				originalTarget: "generated.png",
				localFile: image,
			},
		],
	});
	const candidate = await p.creation.prepare(
		"文章.md",
		await readFile(request.inputFile, "utf8"),
		[],
		undefined,
		undefined,
		"原始段落",
		{ baseResultId: null, assets: request.assets, theme: "default" },
	);
	await p.creation.adopt(candidate);
	const adopted = await p.store.current("文章.md", "原始段落");
	const refreshed = await p.creation.prepare(
		"文章.md",
		await readFile(adopted.markdownFile, "utf8"),
		[],
		undefined,
		undefined,
		"原始段落",
		{ baseResultId: adopted.id, assets: adopted.assets },
	);
	expect(refreshed.request.assets).toHaveLength(1);
	expect(await readFile(refreshed.request.assets[0].localFile, "utf8")).toBe(
		"image",
	);
});
test("a slow text task cannot replace a layout adopted during its response", async () => {
	const p = await harness();
	const first = await p.creation.prepare("文章.md", "第一版");
	await p.creation.adopt(first);
	vi.mocked(runAgent).mockImplementationOnce(async () => {
		const newer = await p.creation.prepare("文章.md", "后来采用的成稿");
		await p.creation.adopt(newer);
		return '{"markdown":"晚到润色"}';
	});
	await expect(p.creation.polish("文章.md", "清楚", "要求")).rejects.toThrow(
		"成稿已更新",
	);
	const current = await p.store.current("文章.md", "原始段落");
	expect(await readFile(current.markdownFile, "utf8")).toBe("后来采用的成稿");
});
test("late titles cannot recreate records at a moved article path", async () => {
	const p = await harness();
	const originalRunner = p.runner;
	p.runner = async () => {
		const runner = await originalRunner();
		return {
			run: async (args: string[]) =>
				args[0] === "title"
					? { success: true, data: { prompt: "titles" } }
					: runner.run(args),
		};
	};
	vi.mocked(runAgent).mockImplementationOnce(async () => {
		p.source = async () => {
			throw new Error("文章不存在");
		};
		return '{"candidates":[{"title":"晚到标题"}]}';
	});
	await expect(p.creation.titles("文章.md", 3)).rejects.toThrow("文章已移动");
	expect((await p.creationStore.read("文章.md")).titles).toEqual([]);
});
test("late covers remain recoverable with the original hash after source changes", async () => {
	const p = await harness();
	const file = join(p.root, "completed.png");
	await writeFile(file, "completed image");
	vi.mocked(generateLocalImage)
		.mockImplementationOnce(async () => {
			p.source = async () => ({
				sourcePath: "文章.md",
				markdown: "已更新",
			});
			return file;
		})
		.mockResolvedValueOnce(file);
	await p.creation.covers("文章.md", "cover-default");
	const recovered = await p.creationStore.read("文章.md");
	expect(recovered.covers).toHaveLength(1);
	expect(recovered.covers[0].sourceHash).toBe(hash("原始段落"));
	expect(await readFile(file, "utf8")).toBe("completed image");
});
test("paid covers wait for rename and remain attached to the original moved article", async () => {
	const p = await harness();
	await p.creationStore.addTitles("文章.md", "hash", ["已保存"]);
	const article = p.app.vault.getAbstractFileByPath("文章.md");
	let moving: Promise<void> | undefined;
	vi.mocked(generateLocalImage)
		.mockImplementationOnce(async () => {
			article.path = "文件夹/新文章.md";
			moving = renameResources(
				p.store,
				p.creationStore,
				"文章.md",
				article.path,
			);
			return "/tmp/first.png";
		})
		.mockResolvedValueOnce("/tmp/second.png");
	const generated = await p.creation.covers("文章.md", "cover-default");
	await moving;
	expect(generated.sourcePath).toBe("文件夹/新文章.md");
	expect(
		(await p.creationStore.read("文件夹/新文章.md")).covers[0].items,
	).toHaveLength(2);
	expect(
		(await p.creationStore.read("文件夹/新文章.md")).titles[0].items[0]
			.text,
	).toBe("已保存");
	expect((await p.creationStore.read("文章.md")).covers).toEqual([]);
});
