import {
	Modal,
	FuzzySuggestModal,
	Setting,
	TFile,
	FileSystemAdapter,
	Notice,
} from "obsidian";
import { readFile } from "node:fs/promises";
import type Md2WechatPlugin from "../../main";
import { hash, type Result } from "../results/result-store";
import { CatalogService, type Account } from "../cli/catalog-service";
import { createConfirmedDraft } from "../publish/draft-service";
import { selectedTitle } from "../creation/creation-store";
export class PublishModal extends Modal {
	constructor(
		private plugin: Md2WechatPlugin,
		private result: Result,
	) {
		super(plugin.app);
		plugin.register(() => this.close());
	}
	async onOpen() {
		this.setTitle("确认创建草稿");
		const content = this.contentEl;
		content.addClass("md2w-confirm");
		const feedback = content.createEl("p", {
			text: "正在读取发布资料…",
			attr: { role: "status", "aria-live": "polite" },
		});
		try {
			const response = JSON.parse(
				await readFile(this.result.previewResponseFile, "utf8"),
			);
			const metadata = response.data.inspect.metadata;
			const accounts = await new CatalogService(
				await this.plugin.runner(),
			).accounts();
			if (!accounts.length) {
				feedback.setText(
					"请先在 md2wechat 中配置公众号账号，完成后再来创建草稿。",
				);
				return;
			}
			let account: Account | undefined =
				accounts.length === 1
					? accounts[0]
					: accounts.find(
							(a) => a.name === this.plugin.settings.lastAccount,
						);
			let title = metadata.title.value as string,
				author = metadata.author.value as string,
				digest = metadata.digest.value as string,
				coverFile = "",
				coverHash = "";
			const choices = this.plugin.creationStore
				? await this.plugin.creationStore.read(this.result.sourcePath)
				: undefined;
			if (choices) title = selectedTitle(choices) ?? title;
			if (choices?.coverPath) {
				const selected = this.app.vault.getAbstractFileByPath(
					choices.coverPath,
				);
				if (selected instanceof TFile) {
					coverFile = (
						this.app.vault.adapter as FileSystemAdapter
					).getFullPath(selected.path);
					coverHash = hash(await readFile(coverFile));
				}
			}
			let busy = false;
			const selectedTitleBatch = choices?.titles.find((b) =>
				b.items.some((i) => i.id === choices.selectedTitle),
			);
			const selectedCoverBatch = choices?.covers.find((b) =>
				b.items.some((i) => i.id === choices.selectedCover),
			);
			if (
				[selectedTitleBatch, selectedCoverBatch].some(
					(b) => b && b.sourceHash !== this.result.sourceHash,
				)
			) {
				content.createEl("p", {
					text: "标题或封面来自较早的文章内容，请确认仍然适合当前成稿。",
				});
			}
			feedback.setText(
				"创建到公众号草稿箱，仍可在公众号后台继续编辑。不会直接发布。",
			);
			new Setting(content).setName("公众号").addDropdown((drop) => {
				drop.addOption("", "选择公众号");
				for (const a of accounts)
					drop.addOption(
						a.appid,
						a.name || `当前公众号 · ${a.appid.slice(-4)}`,
					);
				drop.setValue(account?.appid ?? "").onChange((value) => {
					account = accounts.find((a) => a.appid === value);
				});
			});
			new Setting(content)
				.setName("标题")
				.setDesc(`最多 ${metadata.title.limit} 字`)
				.addText((text) =>
					text.setValue(title).onChange((value) => {
						title = value;
					}),
				);
			new Setting(content)
				.setName("作者")
				.setDesc(`最多 ${metadata.author.limit} 字，可留空`)
				.addText((text) =>
					text.setValue(author).onChange((value) => {
						author = value;
					}),
				);
			new Setting(content)
				.setName("摘要")
				.setDesc(`最多 ${metadata.digest.limit} 字，可留空`)
				.addTextArea((text) =>
					text.setValue(digest).onChange((value) => {
						digest = value;
					}),
				);
			const coverPreview = content.createEl("img", {
				cls: "md2w-cover",
				attr: { alt: "草稿封面" },
			});
			coverPreview.hidden = !coverFile;
			if (coverFile) {
				const bytes = await readFile(coverFile);
				coverPreview.src = `data:image/${coverFile.toLowerCase().endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
			}
			new Setting(content)
				.setName("封面")
				.setDesc("选择笔记库中的图片，最终确认后才会上传。")
				.addButton((button) =>
					button
						.setButtonText(coverFile ? "更换封面" : "选择封面")
						.onClick(() =>
							new CoverPicker(this.plugin, async (file) => {
								try {
									const selected = (
										this.app.vault
											.adapter as FileSystemAdapter
									).getFullPath(file.path);
									const bytes = await readFile(selected);
									if (bytes.length > 20 * 1024 * 1024)
										throw new Error(
											"封面超过 20 MB，请选择较小的图片",
										);
									coverFile = selected;
									coverHash = hash(bytes);
									coverPreview.src = `data:image/${file.extension.replace("jpg", "jpeg")};base64,${bytes.toString("base64")}`;
									coverPreview.hidden = false;
									button.setButtonText(file.name);
								} catch (e) {
									feedback.setText(
										e instanceof Error
											? e.message
											: String(e),
									);
								}
							}).open(),
						),
				);
			const actions = new Setting(content);
			actions.addButton((button) =>
				button.setButtonText("取消").onClick(() => this.close()),
			);
			actions.addButton((button) =>
				button
					.setButtonText("确认创建草稿")
					.setCta()
					.onClick(async () => {
						if (busy) return;
						if (!account || !coverFile) {
							feedback.setText("请选择公众号和封面");
							return;
						}
						const confirmed = {
							account,
							title,
							author,
							digest,
							coverFile,
							coverHash,
						};
						busy = true;
						button.setDisabled(true);
						feedback.setText("正在核对并创建草稿，请稍候…");
						try {
							const source = await this.plugin.source(
								this.result.sourcePath,
							);
							if (
								hash(source.markdown) !== this.result.sourceHash
							)
								throw new Error(
									"原文已更新，请重新排版后再创建",
								);
							const outcome = await createConfirmedDraft(
								this.plugin.root,
								{
									resultId: this.result.id,
									sourcePath: this.result.sourcePath,
									sourceHash: this.result.sourceHash,
									htmlFile: this.result.htmlFile,
									htmlHash: this.result.htmlHash,
									markdownFile: this.result.markdownFile,
									...confirmed,
									assets: this.result.assets,
								},
								await this.plugin.runner(),
								async () =>
									hash(
										(
											await this.plugin.source(
												this.result.sourcePath,
											)
										).markdown,
									),
							);
							if (outcome.kind === "completed") {
								this.plugin.settings.lastAccount = account.name;
								this.close();
								new Notice("公众号草稿已创建");
								this.plugin.refresh();
								// Saving a preference must never turn a successful draft into a retry.
								await this.plugin
									.saveSettings()
									.catch(() => {});
							} else {
								feedback.setText(outcome.message);
								if (outcome.kind === "blocked") {
									busy = false;
									button.setDisabled(false);
								}
							}
						} catch (e) {
							feedback.setText(
								e instanceof Error ? e.message : String(e),
							);
							busy = false;
							button.setDisabled(false);
						}
					}),
			);
		} catch (e) {
			feedback.setText(e instanceof Error ? e.message : String(e));
		}
	}
	onClose() {
		this.contentEl.empty();
	}
}

class CoverPicker extends FuzzySuggestModal<TFile> {
	constructor(
		plugin: Md2WechatPlugin,
		private choose: (file: TFile) => void,
	) {
		super(plugin.app);
		this.setPlaceholder("搜索封面图片");
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
