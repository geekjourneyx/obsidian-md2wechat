import { expect, test, vi } from "vitest";
const ui = vi.hoisted(() => ({
	buttons: [] as any[],
	picker: null as any,
	notices: [] as string[],
}));
vi.mock("obsidian", () => {
	class Control {
		label = "";
		disabled = false;
		click: () => any = () => {};
		setButtonText(v: string) {
			this.label = v;
			return this;
		}
		setDisabled(v: boolean) {
			this.disabled = v;
			return this;
		}
		onClick(v: () => any) {
			this.click = v;
			return this;
		}
		setCta() {
			return this;
		}
		addOption() {
			return this;
		}
		setValue() {
			return this;
		}
		onChange() {
			return this;
		}
	}
	class Setting {
		setName() {
			return this;
		}
		setDesc() {
			return this;
		}
		addButton(fn: any) {
			const c = new Control();
			ui.buttons.push(c);
			fn(c);
			return this;
		}
		addDropdown(fn: any) {
			fn(new Control());
			return this;
		}
		addText(fn: any) {
			fn(new Control());
			return this;
		}
		addTextArea(fn: any) {
			fn(new Control());
			return this;
		}
	}
	const content = () => ({
		addClass() {},
		createEl: () => ({ setText() {}, hidden: false }),
		empty() {},
	});
	return {
		Modal: class {
			contentEl = content();
			close = vi.fn();
			constructor(public app: any) {}
			setTitle() {}
		},
		FuzzySuggestModal: class {
			constructor(public app: any) {}
			setPlaceholder() {}
			open() {
				ui.picker = this;
			}
		},
		Setting,
		TFile: class {},
		FileSystemAdapter: class {},
		Notice: class {
			constructor(text: string) {
				ui.notices.push(text);
			}
		},
	};
});
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(async (path: string) =>
		path === "response"
			? JSON.stringify({
					data: {
						inspect: {
							metadata: {
								title: { value: "测试", limit: 64 },
								author: { value: "", limit: 8 },
								digest: { value: "", limit: 120 },
							},
						},
					},
				})
			: Buffer.from("cover"),
	),
}));
vi.mock("../cli/catalog-service", () => ({
	CatalogService: class {
		async accounts() {
			return [{ name: "test", appid: "one" }];
		}
	},
}));
vi.mock("../publish/draft-service", () => ({ createConfirmedDraft: vi.fn() }));
import { createConfirmedDraft } from "../publish/draft-service";
import { hash } from "../results/result-store";
import { PublishModal } from "./publish-modal";

test.each([false, true])(
	"success closes and refreshes even when preference save fails: %s",
	async (saveFails) => {
		ui.buttons = [];
		ui.notices = [];
		vi.mocked(createConfirmedDraft).mockResolvedValue({
			kind: "completed",
			mediaId: "existing",
		});
		const plugin = {
			app: { vault: { adapter: { getFullPath: () => "cover" } } },
			register() {},
			settings: { lastAccount: "" },
			runner: async () => ({}),
			source: async () => ({ markdown: "article" }),
			refresh: vi.fn(),
			saveSettings: vi.fn(async () => {
				if (saveFails) throw Error("disk");
			}),
		};
		const modal = new PublishModal(
			plugin as any,
			{
				previewResponseFile: "response",
				sourceHash: hash("article"),
				assets: [],
			} as any,
		);
		await modal.onOpen();
		await ui.buttons.find((b) => b.label === "选择封面").click();
		await ui.picker.choose({
			path: "cover",
			extension: "png",
			name: "cover.png",
		});
		const confirm = ui.buttons.find((b) => b.label === "确认创建草稿");
		await confirm.click();
		expect(modal.close).toHaveBeenCalledOnce();
		expect(plugin.refresh).toHaveBeenCalledOnce();
		expect(ui.notices).toEqual(["公众号草稿已创建"]);
		expect(confirm.disabled).toBe(true);
	},
);
