import {
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	FileSystemAdapter,
} from "obsidian";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { DEFAULT_SETTINGS, type Md2WechatSettings } from "./settings";
import { Md2WechatView, MD2WECHAT_VIEW_TYPE } from "./view";
import {
	createResultStore,
	hash,
	type ResultStore,
	type ResultFiles,
} from "./src/results/result-store";
import { downloadImage } from "./src/source/remote-image";
import { resolveAssets } from "./src/source/resolve-assets";
import { createCliRunner, CliProcessRegistry } from "./src/cli/runner";
import { CatalogService, locateCli } from "./src/cli/catalog-service";
import { renderPreview } from "./src/cli/preview-service";
import { createCreationStore } from "./src/creation/creation-store";
import { CreationController } from "./src/creation/creation-controller";
import { AgentConnectModal } from "./src/ui/creation-modals";
export default class Md2WechatPlugin extends Plugin {
	settings: Md2WechatSettings = DEFAULT_SETTINGS;
	store!: ResultStore;
	creationStore!: ReturnType<typeof createCreationStore>;
	creation!: CreationController;
	root = "";
	private legacy: Record<string, unknown> = {};
	private recent: MarkdownView | null = null;
	private processes = new CliProcessRegistry();
	async onload() {
		this.legacy = (await this.loadData()) ?? {};
		this.settings = { ...DEFAULT_SETTINGS, ...this.legacy };
		const vault = this.app.vault.adapter;
		if (!(vault instanceof FileSystemAdapter))
			throw new Error("公众号排版目前需要桌面端本地笔记库");
		const data =
			process.platform === "darwin"
				? join(homedir(), "Library", "Application Support")
				: process.platform === "win32"
					? (process.env.LOCALAPPDATA ?? homedir())
					: (process.env.XDG_DATA_HOME ??
						join(homedir(), ".local", "share"));
		this.root = join(
			data,
			"md2wechat",
			"obsidian-results",
			hash(vault.getBasePath()).slice(0, 24),
		);
		this.store = createResultStore(this.root);
		this.creationStore = createCreationStore(join(this.root, "creation"));
		this.creation = new CreationController(this);
		this.registerView(
			MD2WECHAT_VIEW_TYPE,
			(leaf) => new Md2WechatView(leaf, this),
		);
		this.addRibbonIcon(
			"newspaper",
			"公众号排版",
			() => void this.openPreview(),
		);
		this.addCommand({
			id: "convert-to-wechat-html",
			name: "打开公众号排版",
			callback: () => void this.openPreview(),
		});
		this.addCommand({
			id: "open-publishing-preview",
			name: "查看排版结果",
			callback: () => void this.openPreview(),
		});
		this.registerCliHandler(
			"md2wechat-publisher:capture",
			"获取当前文章的排版副本",
			{
				source: {
					value: "<vault-relative-path>",
					description: "明确指定文章路径",
				},
			},
			async (params) => JSON.stringify(await this.capture(params.source)),
		);
		this.registerCliHandler(
			"md2wechat-publisher:present",
			"展示本次排版结果",
			{
				request: {
					value: "<id>",
					description: "捕获请求",
					required: true,
				},
				markdown: {
					value: "<path>",
					description: "排版正文",
					required: true,
				},
				preview: {
					value: "<path>",
					description: "预览 HTML",
					required: true,
				},
				response: {
					value: "<path>",
					description: "md2wechat preview 返回文件",
					required: true,
				},
			},
			async (params) =>
				JSON.stringify(
					await this.present(params.request, {
						markdown: params.markdown,
						preview: params.preview,
						response: params.response,
					}),
				),
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof MarkdownView) {
					this.recent = leaf.view;
					for (const item of this.app.workspace.getLeavesOfType(
						MD2WECHAT_VIEW_TYPE,
					))
						if (item.view instanceof Md2WechatView)
							item.view.sourcePath = leaf.view.file?.path ?? "";
				}
				this.refresh();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("editor-change", () => this.refresh()),
		);
		this.registerEvent(this.app.vault.on("delete", () => this.refresh()));
		this.registerEvent(
			this.app.vault.on("rename", (file, old) => {
				const destination = file.path;
				void import("./src/creation/rename-resources")
					.then(async ({ renameResources, renamedPath }) => {
						// The vault has already moved. Update views even when a record conflict requires attention.
						for (const leaf of this.app.workspace.getLeavesOfType(
							MD2WECHAT_VIEW_TYPE,
						)) {
							if (
								leaf.view instanceof Md2WechatView &&
								leaf.view.sourcePath
							)
								leaf.view.sourcePath = renamedPath(
									leaf.view.sourcePath,
									old,
									destination,
								);
						}
						await renameResources(
							this.store,
							this.creationStore,
							old,
							destination,
						);
					})
					.catch((error) => new Notice(String(error)))
					.finally(() => this.refresh());
			}),
		);
		this.addSettingTab(new PublishingSettings(this.app, this));
	}
	onunload() {
		this.processes.shutdownNow();
	}
	async saveSettings() {
		await this.saveData({ ...this.legacy, ...this.settings });
	}
	async runner() {
		return createCliRunner(
			await locateCli(this.settings.cliPath),
			this.processes,
		);
	}
	async catalog() {
		return new CatalogService(await this.runner()).load();
	}
	async source(
		explicit?: string,
	): Promise<{ sourcePath: string; markdown: string }> {
		const current = this.app.workspace.getActiveViewOfType(MarkdownView);
		const target =
			explicit ?? current?.file?.path ?? this.recent?.file?.path;
		if (!target) throw new Error("请先打开要排版的文章");
		const file = this.app.vault.getAbstractFileByPath(target);
		if (!(file instanceof TFile) || file.extension !== "md")
			throw new Error("这篇文章已不存在，请重新打开文章");
		const views = this.app.workspace
			.getLeavesOfType("markdown")
			.map((l) => l.view)
			.filter(
				(v): v is MarkdownView =>
					v instanceof MarkdownView && v.file?.path === target,
			);
		const values = [...new Set(views.map((v) => v.editor.getValue()))];
		if (values.length > 1)
			throw new Error(
				"同一篇文章在多个窗口内容不同，请先保留一个编辑版本",
			);
		if (!explicit && views.length === 0)
			throw new Error("请先打开要排版的文章");
		return {
			sourcePath: target,
			markdown: values[0] ?? (await this.app.vault.read(file)),
		};
	}
	async capture(explicit?: string) {
		const source = await this.source(explicit);
		const assets = await resolveAssets(source.markdown, async (target) => {
			if (/^https?:\/\//i.test(target))
				return downloadImage(target, join(this.root, "downloads"));
			const file = this.app.metadataCache.getFirstLinkpathDest(
				target,
				source.sourcePath,
			);
			return file instanceof TFile
				? (this.app.vault.adapter as FileSystemAdapter).getFullPath(
						file.path,
					)
				: null;
		});
		const previousResult = await this.store.current(
			source.sourcePath,
			source.markdown,
		);
		const result = await this.store.capture({ ...source, assets });
		return {
			...result,
			previousResult: previousResult
				? {
						markdownFile: previousResult.markdownFile,
						state: previousResult.state,
					}
				: undefined,
			vaultPath: (
				this.app.vault.adapter as FileSystemAdapter
			).getBasePath(),
		};
	}
	async present(request: string, files: ResultFiles) {
		const captured = await this.store.request(request);
		const source = await this.source(captured.sourcePath);
		const result = await this.store.present(
			request,
			files,
			source.markdown,
		);
		await this.openPreview(captured.sourcePath);
		return {
			requestId: request,
			state: result.state === "current" ? "presented" : result.state,
		};
	}
	async previewOriginal(
		sourcePath?: string,
		theme?: string,
		fontSize = "medium",
		formatted?: string,
	) {
		const request = await this.capture(sourcePath);
		const catalog = await this.catalog();
		const content =
			formatted ?? (await readFile(request.inputFile, "utf8"));
		const files = await renderPreview(
			await this.runner(),
			request,
			content,
			theme ?? catalog.defaultTheme,
			fontSize,
		);
		await this.present(request.requestId, files);
	}
	async openPreview(sourcePath?: string) {
		let leaf = this.app.workspace.getLeavesOfType(MD2WECHAT_VIEW_TYPE)[0];
		if (!leaf) {
			leaf =
				this.app.workspace.getRightLeaf(false) ??
				this.app.workspace.getLeaf("tab");
			await leaf.setViewState({
				type: MD2WECHAT_VIEW_TYPE,
				active: true,
			});
		}
		await this.app.workspace.revealLeaf(leaf);
		if (leaf.view instanceof Md2WechatView) {
			if (sourcePath) leaf.view.sourcePath = sourcePath;
			await leaf.view.refresh();
		}
	}
	refresh() {
		for (const leaf of this.app.workspace.getLeavesOfType(
			MD2WECHAT_VIEW_TYPE,
		))
			if (leaf.view instanceof Md2WechatView) void leaf.view.refresh();
	}
}
class PublishingSettings extends PluginSettingTab {
	constructor(
		app: import("obsidian").App,
		private plugin: Md2WechatPlugin,
	) {
		super(app, plugin);
	}
	display() {
		this.containerEl.empty();
		new Setting(this.containerEl).setName("公众号排版").setHeading();
		new Setting(this.containerEl)
			.setName("md2wechat 位置")
			.setDesc(
				"通常自动找到。只有找不到时才填写程序的完整路径。账号在 md2wechat 中管理。",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.cliPath)
					.setPlaceholder("自动查找")
					.onChange(async (value) => {
						this.plugin.settings.cliPath = value.trim();
						await this.plugin.saveSettings();
					}),
			);
		new Setting(this.containerEl)
			.setName("创作助手")
			.setDesc(
				this.plugin.settings.agent
					? `已选择 ${this.plugin.settings.agent === "codex" ? "Codex" : "Claude Code"}。文章原文不会被修改。`
					: "选择已安装的 AI 工具，用于智能增强、标题与润色。",
			)
			.addButton((button) =>
				button
					.setButtonText("连接或更换")
					.onClick(() => new AgentConnectModal(this.plugin).open()),
			);
		new Setting(this.containerEl)
			.setName("图片保存位置")
			.setDesc("跟随 Obsidian 附件设置。选中的图片自动保存，原文不变。");
	}
}
