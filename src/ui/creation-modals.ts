import { titleStyles } from "../creation/title-request";
import { CoverCropModal } from "./cover-crop-modal";
import {
	Modal,
	MarkdownRenderer,
	Setting,
	FuzzySuggestModal,
	TFile,
	Notice,
} from "obsidian";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import type Md2WechatPlugin from "../../main";
import { discoverAgents, runAgent } from "../agent";
import { locateCli } from "../cli/catalog-service";
import { imagePresetsFor, loadImagePresets } from "../images/image-presets";
import { imageReadiness } from "../images/local-generator";
import { hash, type Result } from "../results/result-store";
import { preparePreview } from "../preview/prepare-preview";
import {
	type DraftCandidate,
	replaceExact,
} from "../creation/creation-controller";
import { type CreationState } from "../creation/creation-store";
import {
	layoutBlocks,
	layoutNames,
	renderModule,
	applyEnhancements,
	type LayoutKind,
} from "../creation/layout-engine";

class CreationModal extends Modal {
	protected abort = new AbortController();
	protected closed = false;
	protected busy = false;
	protected feedback!: HTMLElement;
	constructor(protected plugin: Md2WechatPlugin) {
		super(plugin.app);
		plugin.register(() => this.close());
	}
	protected begin(title: string) {
		this.setTitle(title);
		this.contentEl.addClass("md2w-creation");
		this.feedback = this.contentEl.createEl("p", {
			attr: { role: "status", "aria-live": "polite" },
		});
	}
	protected async action(work: () => Promise<void>) {
		if (this.busy || this.closed) return;
		this.busy = true;
		const controls = Array.from(
			this.contentEl.querySelectorAll?.<
				HTMLInputElement | HTMLSelectElement | HTMLButtonElement
			>("input,select,button,textarea") ?? [],
		).map((element) => ({ element, disabled: element.disabled }));
		controls.forEach(({ element }) => {
			element.disabled = true;
		});
		try {
			await work();
		} catch (error) {
			if (!this.closed)
				this.feedback.setText(
					error instanceof Error
						? error.message
						: "操作未完成，请重试",
				);
		} finally {
			this.busy = false;
			if (!this.closed)
				controls.forEach(({ element, disabled }) => {
					element.disabled = disabled;
				});
		}
	}
	protected controls(
		label: string,
		work: () => Promise<void>,
		primary = true,
	) {
		let control!: HTMLButtonElement;
		new Setting(this.contentEl).addButton((button) => {
			control = button.buttonEl;
			button.setButtonText(label);
			if (primary) button.setCta();
			button.onClick(() =>
				this.action(async () => {
					button.setDisabled(true);
					try {
						await work();
					} finally {
						button.setDisabled(false);
					}
				}),
			);
		});
		return control;
	}
	onClose() {
		this.closed = true;
		this.abort.abort();
		this.contentEl.empty();
	}
}
export class AgentConnectModal extends CreationModal {
	async onOpen() {
		this.begin("连接创作助手");
		this.feedback.setText("正在查找已安装的工具…");
		await this.action(async () => {
			const agents = await discoverAgents();
			if (this.closed) return;
			this.feedback.setText("连接测试可能消耗少量额度。");
			for (const agent of agents)
				new Setting(this.contentEl)
					.setName(agent.name)
					.setDesc(
						agent.available
							? `已找到${agent.version ? ` · ${agent.version}` : ""}`
							: "尚未找到，请先安装并登录此工具",
					)
					.addButton((button) =>
						button
							.setButtonText(
								this.plugin.settings.agent === agent.id
									? "重新检查连接"
									: "连接",
							)
							.setDisabled(!agent.available)
							.onClick(() =>
								this.action(async () => {
									this.feedback.setText(
										`正在检查 ${agent.name} 的连接…`,
									);
									const base = join(
										this.plugin.root,
										"connection",
									);
									await mkdir(base, { recursive: true });
									const cwd = await mkdtemp(
										join(base, "check-"),
									);
									const reply = await runAgent({
										provider: agent.id,
										cwd,
										signal: this.abort.signal,
										prompt: "Reply with only OK. Do not read files or use tools.",
									});
									if (!reply.trim())
										throw new Error(
											"没有收到有效回复，请检查登录后重试",
										);
									if (this.closed) return;
									this.plugin.settings.agent = agent.id;
									await this.plugin.saveSettings();
									this.plugin.refresh();
									this.feedback.setText(
										`${agent.name} 已连接，可用于文字创作。图片生成另行检查配置。`,
									);
								}),
							),
					);
		});
	}
}
abstract class BatchModal extends CreationModal {
	protected state!: CreationState;
	protected list!: HTMLElement;
	constructor(
		plugin: Md2WechatPlugin,
		protected sourcePath: string,
	) {
		super(plugin);
	}
	protected async load() {
		this.state = await this.plugin.creationStore.read(this.sourcePath);
	}
	protected abstract render(): Promise<void>;
	private viewedBatch?: string;
	protected async batchPicker(
		kind: "titles" | "covers",
		show: (id: string) => Promise<void>,
	) {
		const batches = this.state[kind];
		this.list.empty();
		if (!batches.length) {
			this.list.createEl("p", {
				text: "暂无候选",
			});
			return;
		}
		const selected = batches.some((b) => b.id === this.viewedBatch)
			? this.viewedBatch!
			: batches[batches.length - 1]!.id;
		const holder = this.list.createDiv();
		new Setting(holder).setName("批次").addDropdown((drop) => {
			batches.forEach((batch, index) =>
				drop.addOption(
					batch.id,
					`第 ${index + 1} 批 · ${new Date(batch.createdAt).toLocaleString()}`,
				),
			);
			drop.setValue(selected).onChange((id) => {
				if (this.busy) {
					drop.setValue(this.viewedBatch ?? selected);
					return;
				}
				this.viewedBatch = id;
				void this.action(() => show(id));
			});
		});
		await show(selected);
	}
}
export class TitlesModal extends BatchModal {
	private generateButton?: HTMLButtonElement;
	async onOpen() {
		this.begin("选择发布标题");
		this.feedback.setText("选中的标题将用于创建草稿。");
		let hook = titleStyles[0].value;
		new Setting(this.contentEl).setName("标题风格").addDropdown((drop) => {
			for (const style of titleStyles)
				drop.addOption(String(style.value), style.label);
			drop.onChange((value) => {
				hook = Number(value);
			});
		});
		this.generateButton = this.controls("生成一批标题", async () => {
			this.feedback.setText("正在生成标题…");
			this.state = await this.plugin.creation.titles(
				this.sourcePath,
				hook,
				this.abort.signal,
			);
			if (this.closed) return;
			await this.render();
			this.feedback.setText("");
		});
		this.list = this.contentEl.createDiv();
		await this.action(async () => {
			await this.load();
			await this.render();
		});
	}
	protected async render() {
		if (this.closed) return;
		let rows: HTMLElement | undefined;
		this.generateButton?.setText(
			this.state.titles.length ? "换一批标题" : "生成一批标题",
		);
		await this.batchPicker("titles", async (id) => {
			rows?.remove();
			rows = this.list.createDiv();
			const batch = this.state.titles.find((b) => b.id === id)!;
			const source = await this.plugin.source(this.sourcePath);
			if (this.closed) return;
			if (hash(source.markdown) !== batch.sourceHash)
				rows.createEl("p", {
					text: "原文已更新：本批标题来自之前的内容。",
				});
			for (const item of batch.items) {
				const label = rows.createEl("label", { cls: "md2w-candidate" });
				const radio = label.createEl("input", {
					type: "radio",
					attr: { name: "md2w-title", value: item.id },
				});
				radio.checked = this.state.selectedTitle === item.id;
				label.createSpan({ text: item.text });
				if (radio.checked) label.createSpan({ text: " · 已选" });
				radio.addEventListener("change", () => {
					if (this.busy) {
						radio.checked = this.state.selectedTitle === item.id;
						return;
					}
					void this.action(async () => {
						try {
							this.state =
								await this.plugin.creationStore.selectTitle(
									this.sourcePath,
									item.id,
								);
							this.plugin.refresh();
							this.feedback.setText("");
						} finally {
							await this.render();
						}
					});
				});
			}
		});
	}
}
export class ExistingCoverPicker extends FuzzySuggestModal<TFile> {
	constructor(
		plugin: Md2WechatPlugin,
		private choose: (file: TFile) => void,
	) {
		super(plugin.app);
		this.setPlaceholder("选择笔记库中的封面");
	}
	getItems() {
		return this.app.vault
			.getFiles()
			.filter((f) => /^(png|jpe?g|gif|webp)$/i.test(f.extension));
	}
	getItemText(file: TFile) {
		return file.path;
	}
	onChooseItem(file: TFile) {
		this.choose(file);
	}
}
export class CoversModal extends BatchModal {
	private generateButton?: HTMLButtonElement;
	async onOpen() {
		this.begin("选择封面");
		this.feedback.setText("");
		this.controls(
			"选择已有图片",
			async () => {
				new ExistingCoverPicker(this.plugin, (file) => {
					void this.action(async () => {
						this.state =
							await this.plugin.creationStore.setCoverPath(
								this.sourcePath,
								file.path,
							);
						this.plugin.refresh();
						await this.render();
						this.feedback.setText("已设为封面");
					});
				}).open();
			},
			false,
		);
		const generation = this.contentEl.createDiv();
		this.list = this.contentEl.createDiv();
		await this.action(async () => {
			await this.load();
			await this.render();
			const readiness = await imageReadiness(
				await locateCli(this.plugin.settings.cliPath),
			);
			if (this.closed) return;
			generation.createEl("p", { text: readiness.message });
			if (!readiness.available) return;
			const presets = imagePresetsFor(
				await loadImagePresets(
					await this.plugin.runner(),
					this.abort.signal,
				),
				"cover",
			);
			if (this.closed) return;
			if (!presets.length) {
				generation.createEl("p", {
					text: "未找到可用封面风格，请检查 md2wechat。",
				});
				return;
			}
			let preset =
				presets.find((p) => p.id === this.plugin.settings.coverPreset)
					?.id ??
				presets.find((p) => p.id === "cover-default")?.id ??
				presets[0]!.id;
			const styleSetting = new Setting(generation)
				.setName("封面风格")
				.setDesc(presets.find((p) => p.id === preset)!.description);
			styleSetting.addDropdown((drop) => {
				for (const p of presets) drop.addOption(p.id, p.label);
				drop.setValue(preset).onChange((value) => {
					if (this.busy) {
						drop.setValue(preset);
						return;
					}
					preset = value;
					styleSetting.setDesc(
						presets.find((p) => p.id === preset)!.description,
					);
					this.plugin.settings.coverPreset = value;
					void this.action(() => this.plugin.saveSettings());
				});
			});
			generation.createEl("p", {
				text: "每次生成 2 张，将发送文章内容，可能产生费用。",
			});
			new Setting(generation).addButton((button) => {
				this.generateButton = button.buttonEl;
				button
					.setButtonText(
						this.state.covers.length
							? "换一批封面"
							: "生成 2 张封面",
					)
					.setCta()
					.onClick(() =>
						this.action(async () => {
							button.setDisabled(true);
							try {
								const result =
									await this.plugin.creation.covers(
										this.sourcePath,
										preset,
										this.abort.signal,
										(message) => {
											if (!this.closed)
												this.feedback.setText(message);
										},
									);
								if (this.closed) return;
								this.sourcePath = result.sourcePath;
								this.state = result.state;
								await this.render();
								this.feedback.setText(result.message);
							} finally {
								button.setDisabled(false);
							}
						}),
					);
			});
		});
	}
	protected async render() {
		if (this.closed) return;
		let rows: HTMLElement | undefined;
		this.generateButton?.setText(
			this.state.covers.length ? "换一批封面" : "生成 2 张封面",
		);
		await this.batchPicker("covers", async (id) => {
			rows?.remove();
			rows = this.list.createDiv();
			const batch = this.state.covers.find((b) => b.id === id)!;
			const source = await this.plugin.source(this.sourcePath);
			if (this.closed) return;
			if (hash(source.markdown) !== batch.sourceHash)
				rows.createEl("p", {
					text: "原文已更新：本批封面来自之前的内容。",
				});
			for (const item of batch.items) {
				const card = rows.createDiv({ cls: "md2w-cover-candidate" });
				try {
					const bytes = await readFile(item.file);
					if (bytes.length > 20 * 1024 * 1024) throw new Error();
					if (this.closed) return;
					const src = `data:image/${extname(item.file).slice(1).replace("jpg", "jpeg")};base64,${bytes.toString("base64")}`;
					card.createEl("img", { attr: { src, alt: item.label } });
					const zoom = card.createEl("button", { text: "放大查看" });
					zoom.addEventListener("click", () => {
						const modal = new Modal(this.app);
						modal.setTitle(item.label);
						modal.contentEl.createEl("img", {
							attr: { src, alt: item.label },
							cls: "md2w-cover-enlarged",
						});
						modal.open();
					});
				} catch {
					card.createEl("p", {
						text: "图片文件已找不到，请重新生成或选择已有图片。",
					});
					continue;
				}
				const crop = card.createEl("button", { text: "调整裁剪" });
				crop.addEventListener("click", () => {
					new CoverCropModal(
						this.plugin,
						this.sourcePath,
						item.file,
						batch.sourceHash,
						async () => {
							if (this.closed) return;
							await this.load();
							await this.render();
							this.feedback.setText("已设为封面");
						},
					).open();
				});
				const label = card.createEl("label");
				const radio = label.createEl("input", {
					type: "radio",
					attr: { name: "md2w-cover", value: item.id },
				});
				radio.checked = this.state.selectedCover === item.id;
				label.createSpan({
					text: `${item.label}${radio.checked ? " · 已选" : ""}`,
				});
				radio.addEventListener("change", () => {
					if (this.busy) {
						radio.checked = this.state.selectedCover === item.id;
						return;
					}
					void this.action(async () => {
						try {
							this.state =
								await this.plugin.creation.selectedCover(
									this.sourcePath,
									item.id,
								);
							this.plugin.refresh();
							this.feedback.setText("");
						} finally {
							await this.render();
						}
					});
				});
			}
		});
		if (this.state.coverPath) {
			this.list.createEl("p", {
				text: `当前封面：${this.state.coverPath.split("/").pop()}`,
			});
			const chosen = this.app.vault.getAbstractFileByPath(
				this.state.coverPath,
			);
			if (chosen instanceof TFile)
				this.list.createEl("img", {
					cls: "md2w-cover-enlarged md2w-selected-cover",
					attr: {
						src: this.app.vault.getResourcePath(chosen),
						alt: "当前已选封面",
					},
				});
		}
	}
}
export class DraftReviewModal extends CreationModal {
	constructor(
		plugin: Md2WechatPlugin,
		private candidate: DraftCandidate,
	) {
		super(plugin);
	}
	async onOpen() {
		this.begin(
			`排版预览 · ${this.candidate.request.sourcePath.split("/").pop()?.replace(/\.md$/i, "")}`,
		);
		this.feedback.setText("采用后更新公众号成稿，不修改笔记。");
		const before = this.contentEl.createEl("details");
		before.createEl("summary", { text: "查看调整前" });
		const beforeBody = before.createDiv();
		if (this.candidate.changes.length) {
			const list = this.contentEl.createEl("ul");
			for (const change of this.candidate.changes)
				list.createEl("li", { text: change.reason });
		}
		await this.action(async () => {
			const c = this.candidate;
			const previous = await this.plugin.store.current(
				c.request.sourcePath,
				c.sourceHash,
			);
			if (previous && previous.id === c.baseResultId) {
				const previousPreview = await preparePreview(
					previous,
					this.contentEl.ownerDocument,
				);
				if (this.closed) return;
				beforeBody.createEl("iframe", {
					cls: "md2w-creation-preview",
					attr: { title: "调整前的公众号成稿", sandbox: "" },
				}).srcdoc = previousPreview.html;
			} else {
				await MarkdownRenderer.render(
					this.app,
					c.before,
					beforeBody,
					c.request.sourcePath,
					this.plugin,
				);
				if (this.closed) return;
			}
			const result: Result = {
				schemaVersion: 1,
				id: c.request.requestId,
				requestId: c.request.requestId,
				sourcePath: c.request.sourcePath,
				sourceHash: hash(c.sourceHash),
				markdownFile: c.files.markdown,
				markdownHash: hash(await readFile(c.files.markdown)),
				htmlFile: c.files.preview,
				htmlHash: hash(await readFile(c.files.preview)),
				previewResponseFile: c.files.response,
				assets: c.request.assets,
				state: "current",
				createdAt: Date.now(),
			};
			const preview = await preparePreview(
				result,
				this.contentEl.ownerDocument,
			);
			if (this.closed) return;
			this.contentEl.createEl("iframe", {
				cls: "md2w-creation-preview",
				attr: { title: "候选公众号成稿", sandbox: "" },
			}).srcdoc = preview.html;
			new Setting(this.contentEl)
				.addButton((b) =>
					b.setButtonText("取消").onClick(() => this.close()),
				)
				.addButton((b) =>
					b
						.setButtonText("采用此成稿")
						.setCta()
						.onClick(() =>
							this.action(async () => {
								b.setDisabled(true);
								try {
									await this.plugin.creation.adopt(c);
									new Notice("已采用");
									this.close();
								} finally {
									b.setDisabled(false);
								}
							}),
						),
				);
		});
	}
}
export class PolishModal extends CreationModal {
	constructor(
		plugin: Md2WechatPlugin,
		private sourcePath: string,
	) {
		super(plugin);
	}
	onOpen() {
		this.begin("润色公众号成稿");
		this.feedback.setText("");
		let style = "清楚简洁",
			custom = "";
		new Setting(this.contentEl).setName("润色方向").addDropdown((d) =>
			d
				.addOption("清楚简洁", "清楚简洁")
				.addOption("保留个人语气", "保留个人语气")
				.addOption("更自然易读", "更自然易读")
				.onChange((v) => {
					style = v;
				}),
		);
		new Setting(this.contentEl)
			.setName("补充要求（可选）")
			.addTextArea((t) =>
				t.setPlaceholder("例如：保留我的口语表达").onChange((v) => {
					custom = v;
				}),
			);
		this.controls("生成润色候选", async () => {
			this.feedback.setText("正在润色…");
			const candidate = await this.plugin.creation.polish(
				this.sourcePath,
				style,
				custom,
				this.abort.signal,
			);
			if (this.closed) return;
			new DraftReviewModal(this.plugin, candidate).open();
			this.close();
		});
	}
}
export class ParagraphModal extends CreationModal {
	constructor(
		plugin: Md2WechatPlugin,
		private sourcePath: string,
	) {
		super(plugin);
	}
	async onOpen() {
		this.begin("改善段落展示");
		this.feedback.setText("");
		await this.action(async () => {
			const ctx = await this.plugin.creation.content(this.sourcePath);
			if (this.closed) return;
			const blocks = layoutBlocks(ctx.markdown);
			if (!blocks.length) {
				this.feedback.setText("暂无可调整的段落");
				return;
			}
			for (const block of blocks) {
				let kind = block.kinds[0]!;
				new Setting(this.contentEl)
					.setName(block.text.slice(0, 100))
					.addDropdown((d) => {
						for (const k of block.kinds)
							d.addOption(k, layoutNames[k]);
						d.onChange((v) => {
							kind = v as typeof kind;
						});
					})
					.addButton((b) =>
						b.setButtonText("查看效果").onClick(() =>
							this.action(async () => {
								const changed = applyEnhancements(
									ctx.markdown,
									[
										{
											index: block.index,
											kind,
											reason: `改为${layoutNames[kind]}`,
										},
									],
								);
								const candidate =
									await this.plugin.creation.prepare(
										this.sourcePath,
										changed.markdown,
										changed.changes,
										ctx.markdown,
										this.abort.signal,
										ctx.source.markdown,
										{
											baseResultId:
												ctx.current?.id ?? null,
										},
									);
								if (this.closed) return;
								new DraftReviewModal(
									this.plugin,
									candidate,
								).open();
								this.close();
							}),
						),
					);
			}
		});
	}
}
export class ChangesModal extends CreationModal {
	constructor(
		plugin: Md2WechatPlugin,
		private result: Result,
	) {
		super(plugin);
	}
	async onOpen() {
		this.begin("查看展示变化");
		await this.action(async () => {
			const changes = await this.plugin.creation.changes(this.result);
			if (this.closed) return;
			this.feedback.setText(changes.length ? "" : "暂无排版调整");
			for (const change of changes) {
				const section = this.contentEl.createDiv();
				section.createEl("p", { text: change.reason });
				section.createEl("blockquote", { text: change.original });
				const review = async (
					replacement: string,
					reason: string,
					kind?: LayoutKind,
				) => {
					const ctx = await this.plugin.creation.content(
						this.result.sourcePath,
					);
					if (ctx.current?.id !== this.result.id)
						throw new Error("成稿已更新，请重新打开变化列表");
					const markdown = replaceExact(
						ctx.markdown,
						change.replacement,
						replacement,
					);
					const candidate = await this.plugin.creation.prepare(
						this.result.sourcePath,
						markdown,
						replacement === change.original
							? changes.filter((c) => c !== change)
							: changes.map((c) =>
									c === change
										? {
												...c,
												replacement,
												reason,
												kind: kind ?? c.kind,
											}
										: c,
								),
						ctx.markdown,
						this.abort.signal,
						ctx.source.markdown,
						{ baseResultId: ctx.current?.id ?? null },
					);
					if (this.closed) return;
					new DraftReviewModal(this.plugin, candidate).open();
					this.close();
				};
				new Setting(section).addButton((b) =>
					b
						.setButtonText("恢复普通段落")
						.onClick(() =>
							this.action(() =>
								review(change.original, "恢复普通段落"),
							),
						),
				);
				const block = layoutBlocks(change.original)[0];
				if (block)
					for (const kind of block.kinds.filter(
						(k) => k !== change.kind,
					))
						new Setting(section).addButton((b) =>
							b
								.setButtonText(`查看${layoutNames[kind]}`)
								.onClick(() =>
									this.action(() =>
										review(
											renderModule(block, kind),
											`改为${layoutNames[kind]}`,
											kind,
										),
									),
								),
						);
			}
		});
	}
}
