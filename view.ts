import {
	ItemView,
	Menu,
	FuzzySuggestModal,
	Notice,
	setIcon,
	type WorkspaceLeaf,
} from "obsidian";
import { readFile } from "node:fs/promises";
import type Md2WechatPlugin from "./main";
import { hash, type Result } from "./src/results/result-store";
import { PublishModal } from "./src/ui/publish-modal";
import { preparePreview } from "./src/preview/prepare-preview";
import { CatalogService } from "./src/cli/catalog-service";
import { articleDraft } from "./src/publish/draft-link";
import {
	AgentConnectModal,
	TitlesModal,
	CoversModal,
	DraftReviewModal,
	PolishModal,
	ParagraphModal,
	ChangesModal,
} from "./src/ui/creation-modals";
import { InsertImageModal } from "./src/ui/insert-image-modal";
import { InspectionModal } from "./src/ui/inspection-modal";
import { selectedTitle } from "./src/creation/creation-store";
export const MD2WECHAT_VIEW_TYPE = "md2wechat-html-view";
export class Md2WechatView extends ItemView {
	async onClose() {
		this.task?.abort();
	}
	sourcePath = "";
	private generation = 0;
	private result: Result | null = null;
	private busy = false;
	private status!: HTMLElement;
	private article!: HTMLElement;
	private toolbar!: HTMLElement;
	private title!: HTMLElement;
	private publish!: HTMLButtonElement;
	private displayed = "";
	private receipt!: HTMLElement;
	private update!: HTMLButtonElement;
	private details!: HTMLElement;
	private task?: AbortController;
	private stop!: HTMLButtonElement;
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: Md2WechatPlugin,
	) {
		super(leaf);
	}
	getState() {
		return { sourcePath: this.sourcePath };
	}
	async setState(state: unknown, result: import("obsidian").ViewStateResult) {
		this.sourcePath =
			typeof (state as any)?.sourcePath === "string"
				? (state as any).sourcePath
				: "";
		await super.setState(state, result);
		await this.refresh();
	}
	getViewType() {
		return MD2WECHAT_VIEW_TYPE;
	}
	getDisplayText() {
		return "公众号排版";
	}
	getIcon() {
		return "newspaper";
	}
	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("md2w-publishing");
		const controls = this.contentEl.createEl("section", {
			cls: "md2w-controls",
			attr: { "aria-label": "排版与草稿操作" },
		});
		const header = controls.createDiv("md2w-heading");
		this.title = header.createEl("h2", { text: "公众号成稿" });
		this.toolbar = controls.createDiv("md2w-toolbar");
		this.button(this.toolbar, "排版", "wand-sparkles", (event) => {
			const menu = new Menu();
			menu.addItem((i) =>
				i.setTitle("基础排版").onClick(() => void this.basicLayout()),
			);
			menu.addItem((i) =>
				i.setTitle("智能增强").onClick(() => void this.enhance()),
			);
			menu.showAtMouseEvent(event);
		});
		this.button(this.toolbar, "完善", "sliders-horizontal", (event) => {
			const menu = new Menu();
			menu.addItem((i) =>
				i
					.setTitle("优化标题")
					.onClick(() =>
						new TitlesModal(this.plugin, this.sourcePath).open(),
					),
			);
			menu.addItem((i) =>
				i
					.setTitle("润色正文")
					.onClick(() =>
						new PolishModal(this.plugin, this.sourcePath).open(),
					),
			);
			menu.addItem((i) =>
				i
					.setTitle("制作封面")
					.onClick(() =>
						new CoversModal(this.plugin, this.sourcePath).open(),
					),
			);
			menu.addItem((i) =>
				i
					.setTitle("插入配图")
					.onClick(() =>
						new InsertImageModal(
							this.plugin,
							this.sourcePath,
						).open(),
					),
			);
			menu.addSeparator();
			menu.addItem((i) =>
				i
					.setTitle("改善段落展示")
					.onClick(() =>
						new ParagraphModal(this.plugin, this.sourcePath).open(),
					),
			);
			menu.addItem((i) =>
				i.setTitle("查看增强变化").onClick(() => {
					if (this.result)
						new ChangesModal(this.plugin, this.result).open();
				}),
			);
			menu.addItem((i) =>
				i.setTitle("发布前检查").onClick(() => {
					if (this.result)
						new InspectionModal(this.plugin, this.result).open();
				}),
			);
			menu.showAtMouseEvent(event);
		});
		this.button(
			this.toolbar,
			"主题",
			"palette",
			(event) => void this.chooseTheme(event),
		);

		this.update = this.button(
			this.toolbar,
			"刷新排版",
			"refresh-cw",
			() => void this.refreshLayout(),
		);
		this.update.addClass("md2w-icon-button");
		const more = this.button(this.toolbar, "更多", "ellipsis", (event) => {
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle("复制排版")
					.setIcon("copy")
					.onClick(() => void this.copy()),
			);
			menu.addItem((i) =>
				i
					.setTitle("连接创作助手")
					.onClick(() => new AgentConnectModal(this.plugin).open()),
			);
			menu.addItem((i) =>
				i.setTitle("撤回上次排版").onClick(
					() =>
						void this.run(async () => {
							const source = await this.plugin.source(
								this.sourcePath,
							);
							await this.plugin.store.restorePrevious(
								source.sourcePath,
								source.markdown,
							);
							await this.refresh();
						}),
				),
			);
			menu.addSeparator();
			for (const [label, size] of [
				["小", "small"],
				["中", "medium"],
				["大", "large"],
			])
				menu.addItem((item) =>
					item
						.setTitle(`字号 · ${label}`)
						.onClick(() => void this.rerender(undefined, size)),
				);
			menu.showAtMouseEvent(event);
		});
		more.addClass("md2w-icon-button");
		const actions = header.createDiv("md2w-primary-actions");
		this.receipt = controls.createDiv("md2w-draft-receipt");
		this.publish = actions.createEl("button", {
			text: "创建草稿",
			cls: "mod-cta",
		});
		this.publish.disabled = true;
		this.publish.addEventListener("click", () => {
			if (this.result?.state === "current")
				new PublishModal(this.plugin, this.result).open();
		});
		this.status = controls.createDiv({
			cls: "md2w-status",
			attr: { role: "status", "aria-live": "polite" },
		});
		this.stop = controls.createEl("button", {
			text: "停止",
			cls: "md2w-stop",
		});
		this.stop.hidden = true;
		this.stop.addEventListener("click", () => this.task?.abort());
		this.plugin.register(() => this.task?.abort());
		this.details = controls.createDiv("md2w-publish-details");
		this.article = this.contentEl.createDiv("md2w-article");
		await this.refresh();
	}
	button(
		parent: HTMLElement,
		text: string,
		icon: string,
		action: (event: MouseEvent) => void,
	) {
		const b = parent.createEl("button", {
			attr: { "aria-label": text, title: text, type: "button" },
		});
		setIcon(b.createSpan(), icon);
		b.createSpan({ text });
		b.addEventListener("click", action);
		return b;
	}
	async refresh() {
		if (!this.article) return;
		const generation = ++this.generation;
		try {
			let source;
			try {
				source = await this.plugin.source(this.sourcePath || undefined);
				if (!this.sourcePath) this.sourcePath = source.sourcePath;
			} catch {
				source = null;
			}
			const result = this.sourcePath
				? await this.plugin.store.current(
						this.sourcePath,
						source?.markdown,
					)
				: null;
			if (generation !== this.generation) return;
			this.result = result;
			this.receipt.empty();
			this.publish.hidden = false;
			this.publish.setText("创建草稿");
			if (result) void this.showReceipt(result, generation);
			this.title.setText(
				this.sourcePath.replace(/\.md$/, "").split("/").pop() ||
					"公众号成稿",
			);
			this.toolbar.hidden = !source;
			this.update.disabled = this.busy;
			this.publish.disabled =
				!result || result.state !== "current" || this.busy;
			this.details.empty();
			if (source && this.plugin.creationStore) {
				const choices = await this.plugin.creationStore.read(
					this.sourcePath,
				);
				if (generation !== this.generation) return;
				const picked = selectedTitle(choices);
				if (picked)
					this.details.createEl("div", {
						text: `发布标题 · ${picked}`,
					});
				if (choices.coverPath)
					this.details.createEl("div", {
						text: "封面已选",
					});
			}
			if (result) {
				if (!this.busy)
					this.status.setText(
						result.state === "source_changed"
							? "原文已更新 · 旧成稿已保留，请更新排版后再创建"
							: "仅调整公众号成稿，原文不变",
					);
				if (this.displayed !== result.id) {
					const preview = await preparePreview(
						result,
						this.contentEl.ownerDocument,
					);
					if (generation !== this.generation) return;
					this.article.empty();
					const frame = this.article.createEl("iframe", {
						attr: {
							title: "公众号文章预览",
							sandbox: "",
							referrerpolicy: "no-referrer",
						},
					});
					frame.srcdoc = preview.html;
					this.displayed = result.id;
				}
			} else {
				this.displayed = "";
				this.status.setText("");
				this.article.empty();
				const empty = this.article.createDiv("md2w-empty");
				empty.createEl("h3", {
					text: source ? "把文章变成公众号成稿" : "从一篇文章开始",
				});
				empty.createEl("p", {
					text: source
						? "排版、选择标题与图片，都在这里完成。你的原文保持不变。"
						: "打开要排版的笔记，再回到这里。",
				});
				if (source) {
					this.button(
						empty,
						"基础排版",
						"file-text",
						() =>
							void this.run(() =>
								this.plugin.previewOriginal(this.sourcePath),
							),
					);
					this.button(
						empty,
						"智能增强",
						"wand-sparkles",
						() => void this.enhance(),
					);
				}
			}
		} catch (e) {
			this.status.setText(e instanceof Error ? e.message : String(e));
			this.publish.disabled = true;
		}
	}
	async showReceipt(result: Result, generation: number) {
		try {
			const accounts = await new CatalogService(
				await this.plugin.runner(),
			).accounts();
			const receipts = await Promise.all(
				accounts.map(async (account) => ({
					account,
					link: await articleDraft(
						this.plugin.root,
						result,
						account.appid,
					),
				})),
			);
			const found = receipts
				.filter((item) => item.link)
				.sort(
					(a, b) =>
						Number(b.link!.current) - Number(a.link!.current) ||
						b.link!.createdAt - a.link!.createdAt,
				)[0];
			const link = found?.link;
			if (generation !== this.generation) return;
			if (!link) {
				if (!this.busy && result.state === "current")
					this.status.setText("仅调整公众号成稿，原文不变");
				return;
			}
			this.receipt.empty();

			const action = this.receipt.createEl("a", {
				text: link.label,
				href: link.url,
				attr: { target: "_blank", rel: "noopener noreferrer" },
			});
			action.addEventListener("click", (event) => {
				event.preventDefault();
				void (
					require("electron") as {
						shell: { openExternal(url: string): Promise<void> };
					}
				).shell
					.openExternal(link.url)
					.catch(
						() =>
							new Notice(
								"无法打开浏览器，请前往公众号后台查看草稿",
							),
					);
			});
			if (!this.busy) {
				const date = new Date(link.createdAt).toLocaleString("zh-CN", {
					month: "numeric",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				const name =
					found.account.name ||
					`公众号 · ${found.account.appid.slice(-4)}`;
				this.status.setText(
					link.current
						? `此版本已创建草稿 · ${name} · ${date}`
						: `旧版本曾创建草稿 · ${name} · ${date}。${result.state === "source_changed" ? "原文有修改，请刷新排版。" : "当前排版尚未创建草稿。"}`,
				);
			}
			this.publish.hidden = false;
			this.publish.setText("创建新版草稿");
		} catch {
			/* Preview remains usable when account lookup is unavailable. */
		}
	}

	async enhance() {
		if (!this.plugin.settings.agent) {
			new AgentConnectModal(this.plugin).open();
			return;
		}
		const sourcePath = this.sourcePath;
		await this.run(async () => {
			this.task = new AbortController();
			this.stop.hidden = false;
			try {
				const candidate = await this.plugin.creation.enhance(
					sourcePath,
					this.task.signal,
				);
				if (!this.task.signal.aborted)
					new DraftReviewModal(this.plugin, candidate).open();
				await this.refresh();
			} finally {
				this.stop.hidden = true;
				this.task = undefined;
			}
		});
	}
	async run(action: () => Promise<void>) {
		if (this.busy) return;
		this.busy = true;
		this.publish.disabled = true;
		this.update.disabled = true;
		this.status.setText("正在准备排版…");
		try {
			await action();
		} catch (e) {
			this.status.setText(e instanceof Error ? e.message : String(e));
		} finally {
			this.busy = false;
			this.update.disabled = false;
			this.publish.disabled =
				!this.result || this.result.state !== "current";
		}
	}
	async chooseTheme(event: MouseEvent) {
		try {
			const catalog = await this.plugin.catalog();
			new ThemePicker(
				this.plugin,
				catalog.themes,
				(name) => void this.rerender(name),
			).open();
		} catch (e) {
			new Notice(String(e));
		}
	}
	async basicLayout() {
		if (this.busy) return;
		if (!this.result) {
			await this.run(() => this.plugin.previewOriginal(this.sourcePath));
			return;
		}
		const result = this.result;
		await this.run(async () => {
			const source = await this.plugin.source(result.sourcePath);
			const before = await readFile(result.markdownFile, "utf8");
			const response = JSON.parse(
				await readFile(result.previewResponseFile, "utf8"),
			);
			const capture = await this.plugin.capture(result.sourcePath);
			if (capture.sourceHash !== hash(source.markdown))
				throw new Error("原文已更新，请重新开始；旧成稿仍保留");
			const markdown = await readFile(capture.inputFile, "utf8");
			const candidate = await this.plugin.creation.prepare(
				result.sourcePath,
				markdown,
				[],
				before,
				undefined,
				source.markdown,
				{
					baseResultId: result.id,
					assets: capture.assets,
					theme: response.data.render.theme,
					fontSize: response.data.inspect.context.font_size,
				},
			);
			new Notice("本次以原文重新排版，确认采用后才替换当前成稿");
			new DraftReviewModal(this.plugin, candidate).open();
		});
	}

	async refreshLayout() {
		if (!this.result || this.busy) return;
		const result = this.result;
		await this.run(async () => {
			const source = await this.plugin.source(result.sourcePath);
			const before = await readFile(result.markdownFile, "utf8");
			if (hash(source.markdown) === result.sourceHash) {
				const candidate = await this.plugin.creation.prepare(
					result.sourcePath,
					before,
					[],
					before,
					undefined,
					source.markdown,
					{ baseResultId: result.id, assets: result.assets },
				);
				await this.plugin.creation.adopt(candidate);
				return;
			}
			const response = JSON.parse(
				await readFile(result.previewResponseFile, "utf8"),
			);
			const capture = await this.plugin.capture(result.sourcePath);
			if (capture.sourceHash !== hash(source.markdown))
				throw new Error("原文已再次更新，请重新刷新；旧成稿仍保留");
			const markdown = await readFile(capture.inputFile, "utf8");
			const candidate = await this.plugin.creation.prepare(
				result.sourcePath,
				markdown,
				[],
				before,
				undefined,
				source.markdown,
				{
					baseResultId: result.id,
					assets: capture.assets,
					theme: response.data.render.theme,
					fontSize: response.data.inspect.context.font_size,
				},
			);
			new DraftReviewModal(this.plugin, candidate).open();
		});
	}

	async rerender(theme?: string, size?: string) {
		if (!this.result) return;
		const result = this.result;
		if (result.state !== "current") {
			new Notice("原文已更新，请先重新排版");
			return;
		}
		await this.run(async () => {
			const source = await this.plugin.source(result.sourcePath);
			if (hash(source.markdown) !== result.sourceHash)
				throw new Error("原文已更新，请先刷新并确认新的成稿");
			const markdown = await readFile(result.markdownFile, "utf8");
			const candidate = await this.plugin.creation.prepare(
				result.sourcePath,
				markdown,
				[],
				markdown,
				undefined,
				source.markdown,
				{
					baseResultId: result.id,
					assets: result.assets,
					theme,
					fontSize: size,
				},
			);
			await this.plugin.creation.adopt(candidate);
		});
	}

	async copy() {
		if (!this.result) return;
		try {
			const html = await readFile(this.result.htmlFile, "utf8");
			const win = this.contentEl.ownerDocument.defaultView!;
			const plain =
				new win.DOMParser().parseFromString(html, "text/html").body
					.textContent ?? "";
			await win.navigator.clipboard.write([
				new win.ClipboardItem({
					"text/html": new Blob([html], { type: "text/html" }),
					"text/plain": new Blob([plain], { type: "text/plain" }),
				}),
			]);
			new Notice(
				this.result.assets.length
					? "已复制排版；本地图片请通过创建草稿上传"
					: "已复制排版",
			);
		} catch {
			new Notice("复制失败，请检查剪贴板权限后重试");
		}
	}
}

class ThemePicker extends FuzzySuggestModal<
	import("./src/cli/catalog-service").Theme
> {
	constructor(
		plugin: Md2WechatPlugin,
		private themes: import("./src/cli/catalog-service").Theme[],
		private choose: (name: string) => void,
	) {
		super(plugin.app);
		this.setPlaceholder("搜索风格，例如：简洁、绿色、新闻");
	}
	getItems() {
		return this.themes;
	}
	getItemText(theme: import("./src/cli/catalog-service").Theme) {
		return theme.description || theme.name;
	}
	onChooseItem(theme: import("./src/cli/catalog-service").Theme) {
		this.choose(theme.name);
	}
}
