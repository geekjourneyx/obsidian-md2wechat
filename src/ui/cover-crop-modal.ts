import { Modal, Setting } from "obsidian";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type Md2WechatPlugin from "../../main";
export function cropRectangle(
	width: number,
	height: number,
	ratio: number,
	x = 0.5,
	y = 0.5,
) {
	if (
		![width, height, ratio, x, y].every(Number.isFinite) ||
		width <= 0 ||
		height <= 0 ||
		ratio <= 0
	)
		throw new Error("图片尺寸不正确");
	const w = Math.min(width, height * ratio),
		h = w / ratio;
	return {
		x: (width - w) * Math.max(0, Math.min(1, x)),
		y: (height - h) * Math.max(0, Math.min(1, y)),
		width: w,
		height: h,
	};
}
export class CoverCropModal extends Modal {
	private closed = false;
	private busy = false;
	constructor(
		private plugin: Md2WechatPlugin,
		private sourcePath: string,
		private file: string,
		private sourceHash: string,
		private saved: () => Promise<void>,
	) {
		super(plugin.app);
		plugin.register(() => this.close());
	}
	async onOpen() {
		this.setTitle("调整封面裁剪");
		this.contentEl.addClass("md2w-creation");
		const feedback = this.contentEl.createEl("p", {
			attr: { role: "status", "aria-live": "polite" },
		});
		try {
			const bytes = await readFile(this.file);
			if (bytes.length > 20 * 1024 * 1024)
				throw new Error("图片过大，请选择其他图片");
			if (this.closed) return;
			const document = this.contentEl.ownerDocument;
			const image = document.createElement("img");
			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error("无法读取这张图片"));
				image.src = `data:image/${extname(this.file).slice(1).replace("jpg", "jpeg")};base64,${bytes.toString("base64")}`;
			});
			if (this.closed) return;
			let ratio = 2.35,
				x = 0.5,
				y = 0.5;
			const canvas = this.contentEl.createEl("canvas", {
				cls: "md2w-crop-preview",
				attr: { "aria-label": "封面裁剪预览", role: "img" },
			});
			const draw = () => {
				const rect = cropRectangle(
					image.naturalWidth,
					image.naturalHeight,
					ratio,
					x,
					y,
				);
				canvas.width = Math.min(1600, Math.round(rect.width));
				canvas.height = Math.max(1, Math.round(canvas.width / ratio));
				const context = canvas.getContext("2d");
				if (!context) throw new Error("当前环境无法调整图片");
				context.drawImage(
					image,
					rect.x,
					rect.y,
					rect.width,
					rect.height,
					0,
					0,
					canvas.width,
					canvas.height,
				);
			};
			new Setting(this.contentEl).setName("图片比例").addDropdown((d) =>
				d
					.addOption("2.35", "横版 2.35:1")
					.addOption("1", "方形 1:1")
					.onChange((value) => {
						ratio = Number(value);
						draw();
					}),
			);
			new Setting(this.contentEl).setName("左右取景").addSlider((s) => {
				s.sliderEl.setAttribute("aria-label", "左右取景");
				s.setLimits(0, 100, 1)
					.setValue(50)
					.setDynamicTooltip()
					.onChange((value) => {
						x = value / 100;
						draw();
					});
			});
			new Setting(this.contentEl).setName("上下取景").addSlider((s) => {
				s.sliderEl.setAttribute("aria-label", "上下取景");
				s.setLimits(0, 100, 1)
					.setValue(50)
					.setDynamicTooltip()
					.onChange((value) => {
						y = value / 100;
						draw();
					});
			});
			draw();
			new Setting(this.contentEl)
				.addButton((b) =>
					b.setButtonText("取消").onClick(() => this.close()),
				)
				.addButton((b) =>
					b
						.setButtonText("设为封面")
						.setCta()
						.onClick(async () => {
							if (this.busy || this.closed) return;
							this.busy = true;
							b.setDisabled(true);
							try {
								const data = canvas.toDataURL("image/png");
								const directory = join(
									this.plugin.root,
									"generation",
									"crops",
								);
								await mkdir(directory, { recursive: true });
								if (this.closed) return;
								const file = join(
									directory,
									`${randomUUID()}.png`,
								);
								await writeFile(
									file,
									Buffer.from(data.split(",")[1]!, "base64"),
									{ flag: "wx", mode: 0o600 },
								);
								if (this.closed) return;
								const state =
									await this.plugin.creationStore.addCovers(
										this.sourcePath,
										this.sourceHash,
										[
											{
												file,
												label:
													ratio === 1
														? "方形裁剪"
														: "横版裁剪",
											},
										],
									);
								if (this.closed) return;
								await this.plugin.creation.selectedCover(
									this.sourcePath,
									state.covers[state.covers.length - 1]!
										.items[0]!.id,
								);
								this.plugin.refresh();
								await this.saved().catch(() => {});
								this.close();
							} catch (error) {
								if (!this.closed)
									feedback.setText(
										error instanceof Error
											? error.message
											: "封面未保存，请重试",
									);
							} finally {
								this.busy = false;
								b.setDisabled(false);
							}
						}),
				);
		} catch (error) {
			if (!this.closed)
				feedback.setText(
					error instanceof Error ? error.message : "图片无法打开",
				);
		}
	}
	onClose() {
		this.closed = true;
		this.contentEl.empty();
	}
}
