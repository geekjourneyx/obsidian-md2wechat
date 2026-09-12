import { beforeEach, expect, it, vi } from "vitest";
const ui = vi.hoisted(() => ({ buttons: [] as any[], nodes: [] as any[] }));
vi.mock("obsidian", () => {
	const node = () => {
		const n: any = {
			checked: false,
			text: "",
			addClass() {},
			setText(t: string) {
				this.text = t;
			},
			empty() {},
			remove() {},
			addEventListener(event: string, fn: any) {
				this[event] = fn;
			},
			createEl(tag: string, options: any) {
				const child = node();
				child.tag = tag;
				child.text = options?.text ?? "";
				child.type = options?.type;
				return child;
			},
			createDiv() {
				return node();
			},
			createSpan(options: any) {
				return this.createEl("span", options);
			},
		};
		ui.nodes.push(n);
		return n;
	};
	class Control {
		label = "";
		disabled = false;
		click: any;
		setButtonText(v: string) {
			this.label = v;
			return this;
		}
		setDisabled(v: boolean) {
			this.disabled = v;
			return this;
		}
		setCta() {
			return this;
		}
		onClick(fn: any) {
			this.click = fn;
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
		setPlaceholder() {
			return this;
		}
	}
	return {
		Modal: class {
			contentEl = node();
			constructor(public app: any) {}
			setTitle() {}
			open() {}
			close() {
				(this as any).onClose();
			}
		},
		Setting: class {
			constructor(...args: any[]) {}
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
			addTextArea(fn: any) {
				fn(new Control());
				return this;
			}
		},
		FuzzySuggestModal: class {},
		TFile: class {},
		FileSystemAdapter: class {},
		Notice: class {},
	};
});
vi.mock("../images/local-generator", () => ({
	imageReadiness: vi.fn(async () => ({ available: true, message: "已配置" })),
}));
vi.mock("../cli/catalog-service", () => ({
	locateCli: vi.fn(async () => "cli"),
	completed: (r: any) => r.data,
}));
import { CoversModal, TitlesModal } from "./creation-modals";
function plugin() {
	return {
		app: {},
		root: "/tmp/test",
		settings: {},
		register: vi.fn(),
		refresh: vi.fn(),
		source: vi.fn(async () => ({ markdown: "source" })),
		runner: vi.fn(async () => ({
			run: vi.fn(async () => ({
				success: true,
				data: {
					prompts: [
						{
							name: "cover-default",
							kind: "image",
							description: "默认",
							archetype: "cover",
						},
					],
				},
			})),
		})),
		creationStore: {
			read: vi.fn(async () => ({ titles: [], covers: [] })),
		},
		creation: {
			titles: vi.fn(async () => ({ titles: [], covers: [] })),
			covers: vi.fn(async () => ({
				state: { titles: [], covers: [] },
				message: "已生成",
				sourcePath: "article.md",
			})),
		},
	} as any;
}
beforeEach(() => {
	ui.buttons = [];
	ui.nodes = [];
});
it("opens cover choices without paid generation, then creates only on explicit click", async () => {
	const p = plugin();
	const modal = new CoversModal(p, "article.md");
	await modal.onOpen();
	expect(p.creation.covers).not.toHaveBeenCalled();
	const button = ui.buttons.find((b) => b.label === "生成 2 张封面");
	expect(button).toBeDefined();
	await button.click();
	expect(p.creation.covers).toHaveBeenCalledTimes(1);
	expect(p.creation.covers.mock.calls[0].slice(0, 2)).toEqual([
		"article.md",
		"cover-default",
	]);
});
it("opening titles does not generate and closing cancels active generation", async () => {
	const p = plugin();
	const modal = new TitlesModal(p, "article.md");
	await modal.onOpen();
	expect(p.creation.titles).not.toHaveBeenCalled();
	let finish: any;
	p.creation.titles.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = ui.buttons.find((b) => b.label === "生成一批标题").click();
	const signal = p.creation.titles.mock.calls[0][2];
	expect(signal.aborted).toBe(false);
	modal.onClose();
	expect(signal.aborted).toBe(true);
	finish({ titles: [], covers: [] });
	await pending;
});
it("choosing a title saves immediately without an adopt step", async () => {
	const p = plugin();
	const state = {
		titles: [
			{
				id: "batch",
				createdAt: 1,
				sourceHash: "old",
				items: [{ id: "candidate", text: "候选标题" }],
			},
		],
		covers: [],
	};
	p.creationStore.read.mockResolvedValue(state);
	p.creationStore.selectTitle = vi.fn(async () => ({
		...state,
		selectedTitle: "candidate",
	}));
	const modal = new TitlesModal(p, "article.md");
	await modal.onOpen();
	const radio = ui.nodes.find((n) => n.type === "radio");
	expect(radio).toBeDefined();
	radio.change();
	await vi.waitFor(() =>
		expect(p.creationStore.selectTitle).toHaveBeenCalledWith(
			"article.md",
			"candidate",
		),
	);
	expect(ui.buttons.some((b) => b.label.includes("采用"))).toBe(false);
});
