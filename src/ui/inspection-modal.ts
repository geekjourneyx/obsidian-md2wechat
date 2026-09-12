import { Modal, Setting, FileSystemAdapter, TFile } from "obsidian";
import type Md2WechatPlugin from "../../main";
import { hash, type Result } from "../results/result-store";
import { selectedTitle } from "../creation/creation-store";
import { readFile } from "node:fs/promises";
import { PublishModal } from "./publish-modal";
export class InspectionModal extends Modal {
	private abort = new AbortController();
	private closed = false;
	constructor(
		private plugin: Md2WechatPlugin,
		private result: Result,
	) {
		super(plugin.app);
		plugin.register(() => this.close());
	}
	async onOpen() {
		this.setTitle("发布前检查");
		this.contentEl.addClass("md2w-creation");
		const status = this.contentEl.createEl("p", {
			text: "正在检查成稿…",
			attr: { role: "status" },
		});
		try {
			const source = await this.plugin.source(this.result.sourcePath);
			if (hash(source.markdown) !== this.result.sourceHash)
				throw new Error("原文已更新，请先更新排版。旧成稿已保留。");
			const choices = await this.plugin.creationStore.read(
				this.result.sourcePath,
			);
			const response = JSON.parse(
				await readFile(this.result.previewResponseFile, "utf8"),
			);
			const args = [
				"inspect",
				this.result.markdownFile,
				"--theme",
				response.data.render.theme,
				"--font-size",
				response.data.inspect.context.font_size,
				"--json",
			];
			const title = selectedTitle(choices);
			if (title) args.push("--title", title);
			if (choices.coverPath) {
				const f = this.app.vault.getAbstractFileByPath(
					choices.coverPath,
				);
				if (f instanceof TFile)
					args.push(
						"--cover",
						(
							this.app.vault.adapter as FileSystemAdapter
						).getFullPath(f.path),
					);
			}
			const result = await (
				await this.plugin.runner()
			).run<any>(args, { signal: this.abort.signal });
			if (this.closed) return;
			if (!result.success)
				throw new Error("检查未完成，请检查 md2wechat 配置后重试");
			status.setText("成稿检查完成。创建前还会核对账号、标题和封面。");
			const checks = result.data.checks;
			const list = Array.isArray(checks) ? checks : [];
			for (const check of list) {
				if (check.severity === "error" || check.severity === "warning")
					this.contentEl.createEl("p", {
						text: String(check.message ?? "请在创建前核对文章资料"),
					});
			}
			if (!choices.coverPath)
				this.contentEl.createEl("p", {
					text: "尚未选择封面，可在下一步选择。",
				});
			this.contentEl.createEl("p", {
				text: "此检查确认成稿准备情况，不代表微信内容审核结果。",
				cls: "md2w-muted",
			});
			new Setting(this.contentEl)
				.addButton((b) =>
					b.setButtonText("关闭").onClick(() => this.close()),
				)
				.addButton((b) =>
					b
						.setButtonText("核对创建资料")
						.setCta()
						.onClick(() => {
							this.close();
							new PublishModal(this.plugin, this.result).open();
						}),
				);
		} catch (e) {
			if (!this.closed)
				status.setText(
					e instanceof Error ? e.message : "检查未完成，请重试",
				);
		}
	}
	onClose() {
		this.closed = true;
		this.abort.abort();
		this.contentEl.empty();
	}
}
