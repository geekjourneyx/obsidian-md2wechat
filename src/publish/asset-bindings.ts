import { parse } from "parse5";
export function imageTargets(html: string): string[] {
	const targets: string[] = [];
	walk(parse(html), (node) => {
		if (node.tagName === "img") {
			const src = node.attrs?.find((a: any) => a.name === "src")?.value;
			if (!src) throw new Error("正文有缺少地址的图片");
			if (node.attrs.some((a: any) => a.name === "srcset"))
				throw new Error("正文包含未确认的多尺寸图片");
			targets.push(src);
		}
	});
	return targets;
}
function walk(node: any, visit: (node: any) => void) {
	visit(node);
	for (const child of node.childNodes ?? []) walk(child, visit);
}
export function replaceImageTargets(
	html: string,
	bindings: Map<string, string>,
): string {
	const replacements: { start: number; end: number; text: string }[] = [];
	walk(parse(html, { sourceCodeLocationInfo: true }), (node) => {
		if (node.tagName !== "img") return;
		const src = node.attrs?.find((a: any) => a.name === "src")?.value;
		const url = bindings.get(src);
		if (!url) throw new Error("图片未完成上传，不能创建草稿");
		const location = node.sourceCodeLocation?.attrs?.src;
		if (!location) throw new Error("图片地址无法定位");
		replacements.push({
			start: location.startOffset,
			end: location.endOffset,
			text: `src="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`,
		});
	});
	for (const item of replacements.sort((a, b) => b.start - a.start))
		html = html.slice(0, item.start) + item.text + html.slice(item.end);
	return html;
}
