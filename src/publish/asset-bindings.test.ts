import { expect, it } from "vitest";
import { imageTargets, replaceImageTargets } from "./asset-bindings";
it("changes only the src attribute, never matching text or CSS", () => {
	const html =
		'<p style="color:red">assets/x.png</p><img alt="assets/x.png" src=\'assets/x.png\' style="width:100%">';
	expect(imageTargets(html)).toEqual(["assets/x.png"]);
	expect(
		replaceImageTargets(
			html,
			new Map([["assets/x.png", "https://mmbiz.qpic.cn/a"]]),
		),
	).toBe(
		'<p style="color:red">assets/x.png</p><img alt="assets/x.png" src="https://mmbiz.qpic.cn/a" style="width:100%">',
	);
});
it("rejects an image missing a frozen binding", () => {
	expect(() =>
		replaceImageTargets('<img src="new.png">', new Map()),
	).toThrow();
});
