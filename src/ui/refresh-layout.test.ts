import { expect, test, vi } from "vitest";
vi.mock("obsidian", () => ({
	ItemView: class {},
	Modal: class {},
	FuzzySuggestModal: class {},
	Notice: class {},
}));
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(async () =>
		JSON.stringify({
			data: {
				render: { theme: "chosen" },
				inspect: { context: { font_size: "large" } },
			},
		}),
	),
}));
import { Md2WechatView } from "../../view";
test("refresh uses fresh source and preserves theme and size without publishing", async () => {
	const previewOriginal = vi.fn();
	const view = new Md2WechatView(
		{} as any,
		{ previewOriginal } as any,
	) as any;
	view.sourcePath = "article.md";
	view.result = {
		state: "source_changed",
		previewResponseFile: "response",
		markdownFile: "stale",
	};
	view.run = async (action: () => Promise<void>) => action();
	await view.refreshLayout();
	expect(previewOriginal).toHaveBeenCalledExactlyOnceWith(
		"article.md",
		"chosen",
		"large",
	);
});
