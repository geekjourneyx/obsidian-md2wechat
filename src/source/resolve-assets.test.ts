import { expect, it } from "vitest";
import { resolveAssets } from "./resolve-assets";
it("finds inline, reference and wiki images but ignores fenced examples", async () => {
	const markdown =
		"![图](图片%20一.png)\n\n![引用][photo]\n\n[photo]: <images/b.png>\n\n![[图 三.jpg|300]]\n\n```md\n![示例](missing.png)\n```";
	const targets: string[] = [];
	const result = await resolveAssets(markdown, async (target) => {
		targets.push(target);
		return "/vault/" + target;
	});
	expect(targets).toEqual(["图片 一.png", "images/b.png", "图 三.jpg"]);
	expect(result.map((a) => markdown.slice(a.tokenStart, a.tokenEnd))).toEqual(
		["图片%20一.png", "images/b.png", "![[图 三.jpg|300]]"],
	);
	expect(result[2].replacementKind).toBe("wiki");
});
it("does not turn ordinary links into image uploads", async () => {
	expect(
		await resolveAssets(
			"[网页](https://example.com)\n`![[inline.png]]`",
			async () => {
				throw new Error("unexpected");
			},
		),
	).toEqual([]);
});
it("rejects unresolved referenced images instead of hiding missing content", async () => {
	await expect(
		resolveAssets("![x][unknown]", async () => null),
	).rejects.toThrow(/图片/);
});
