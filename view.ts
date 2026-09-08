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
import { type Result } from "./src/results/result-store";
import { PublishModal } from "./src/ui/publish-modal";
import { preparePreview } from "./src/preview/prepare-preview";
import { CatalogService } from "./src/cli/catalog-service";
import { articleDraft } from "./src/publish/draft-link";
export const MD2WECHAT_VIEW_TYPE = "md2wechat-html-view";
export class Md2WechatView extends ItemView {
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
		this.title = header.createEl("h2", { text: "让好内容，好好呈现" });
		this.toolbar = controls.createDiv("md2w-toolbar");
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
		const more = this.button(this.toolbar, "更多", "ellipsis", (event) => {
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle("复制排版")
					.setIcon("copy")
					.onClick(() => void this.copy()),
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
		const actions = this.toolbar.createDiv("md2w-primary-actions");
		this.receipt = actions.createDiv("md2w-draft-receipt");
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
			attr: { "aria-label": text, title: text },
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
					"让好内容，好好呈现",
			);
			this.toolbar.hidden = !result;
			this.update.disabled = this.busy;
			this.publish.disabled =
				!result || result.state !== "current" || this.busy;
			if (result) {
				this.status.setText(
					result.state === "source_changed"
						? "原文有修改 · 点击刷新排版查看最新效果"
						: "",
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
				setIcon(empty.createDiv("md2w-empty-icon"), "newspaper");
				empty.createEl("h3", {
					text: source ? "把排版交给你的 Agent" : "从一篇文章开始",
				});
				empty.createEl("p", {
					text: source
						? "在你常用的 Agent 中说："
						: "打开要排版的笔记，再回到这里。",
				});
				if (source) {
					empty.createEl("blockquote", {
						text: "排版 Obsidian 当前文章，完成后展示给我。",
					});
					empty.createEl("p", {
						text: "支持本地工具的 Agent 均可接入。排版完成后，结果会自动出现在这里。",
						cls: "md2w-muted",
					});
					const preview = empty.createEl("button", {
						text: "先预览当前文章",
					});
					preview.addEventListener(
						"click",
						() =>
							void this.run(() =>
								this.plugin.previewOriginal(this.sourcePath),
							),
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
					this.status.setText("尚无创建草稿记录");
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
			this.publish.hidden = link.current && accounts.length === 1;
			this.publish.setText(link.current ? "其他公众号…" : "创建新版草稿");
		} catch {
			/* Preview remains usable when account lookup is unavailable. */
		}
	}

	async run(action: () => Promise<void>) {
		if (this.busy) return;
		this.busy = true;
		this.publish.disabled = true;
		this.update.disabled = true;
		this.status.setText("正在排版，完成后会替换预览…");
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
	async refreshLayout() {
		if (!this.result || this.busy) return;
		const result = this.result;
		await this.run(async () => {
			const response = JSON.parse(
				await readFile(result.previewResponseFile, "utf8"),
			);
			// Capture fresh source, including unsaved edits; never reuse stale formatted text.
			await this.plugin.previewOriginal(
				this.sourcePath,
				response.data.render.theme,
				response.data.inspect.context.font_size,
			);
		});
	}

	async rerender(theme?: string, size?: string) {
		if (!this.result) return;
		if (this.result.state !== "current") {
			new Notice("原文已更新，请先让 Agent 重新排版");
			return;
		}
		const markdown = await readFile(this.result.markdownFile, "utf8");
		const response = JSON.parse(
			await readFile(this.result.previewResponseFile, "utf8"),
		);
		await this.run(() =>
			this.plugin.previewOriginal(
				this.sourcePath,
				theme ?? response.data.render.theme,
				size ?? response.data.inspect.context.font_size,
				markdown,
			),
		);
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
