import { parser } from "@lezer/markdown";
import type { SyntaxNode } from "@lezer/common";
import type { SourceAsset } from "./stage-source";
type ResolvedAsset = SourceAsset & { replacementKind?: "wiki"; alt?: string };
export async function resolveAssets(
	markdown: string,
	resolve: (target: string) => Promise<string | null>,
): Promise<ResolvedAsset[]> {
	const tree = parser.parse(markdown);
	const definitions = new Map<string, SyntaxNode>();
	const images: SyntaxNode[] = [];
	const normalize = (value: string) =>
		value
			.replace(/^\[|\]$/g, "")
			.trim()
			.replace(/\s+/g, " ")
			.toLowerCase();
	tree.iterate({
		enter(node) {
			if (node.name === "LinkReference") {
				const label = node.node.getChild("LinkLabel"),
					url = node.node.getChild("URL");
				if (
					label &&
					url &&
					!definitions.has(
						normalize(markdown.slice(label.from, label.to)),
					)
				)
					definitions.set(
						normalize(markdown.slice(label.from, label.to)),
						url,
					);
			}
			if (node.name === "Image") images.push(node.node);
		},
	});
	const result: ResolvedAsset[] = [];
	const seen = new Set<number>();
	for (const image of images) {
		const text = markdown.slice(image.from, image.to);
		let target: string;
		let from: number;
		let to: number;
		let wiki = false;
		if (text.startsWith("![[") && text.endsWith("]]")) {
			target = text.slice(3, -2).split("|")[0];
			from = image.from;
			to = image.to;
			wiki = true;
		} else {
			let url = image.getChild("URL");
			if (!url) {
				const label = image.getChild("LinkLabel");
				const marks = image.getChildren("LinkMark");
				const inferred =
					marks.length > 1
						? markdown.slice(marks[0].to, marks[1].from)
						: "";
				url =
					definitions.get(
						normalize(
							label
								? markdown.slice(label.from, label.to)
								: inferred,
						),
					) ?? null;
			}
			if (!url) throw new Error(`图片引用无法解析：${text}`);
			from = url.from;
			to = url.to;
			target = markdown.slice(from, to);
			if (target.startsWith("<") && target.endsWith(">")) {
				from++;
				to--;
				target = target.slice(1, -1);
			}
		}
		if (seen.has(from)) continue;
		seen.add(from);
		let decoded: string;
		try {
			decoded = decodeURIComponent(target).replace(
				/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g,
				"$1",
			);
		} catch {
			throw new Error(`图片地址格式有误：${target}`);
		}
		const localFile = await resolve(decoded);
		if (!localFile) throw new Error(`找不到图片：${decoded}`);
		result.push({
			tokenStart: from,
			tokenEnd: to,
			originalTarget: markdown.slice(from, to),
			localFile,
			...(wiki
				? {
						replacementKind: "wiki" as const,
						alt: target.split("/").pop() ?? "",
					}
				: {}),
		});
	}
	return result.sort((a, b) => a.tokenStart - b.tokenStart);
}
// Current CLI inspection scans image-looking text inside code. Exclude code only
// from its inspection copy; the rendered and reviewed Markdown stays unchanged.
export function inspectionMarkdown(markdown: string): string {
	const ranges: { from: number; to: number }[] = [];
	parser.parse(markdown).iterate({
		enter(node) {
			if (["FencedCode", "CodeBlock", "InlineCode"].includes(node.name)) {
				ranges.push({ from: node.from, to: node.to });
				return false;
			}
		},
	});
	for (const range of ranges.reverse())
		markdown =
			markdown.slice(0, range.from) + "\n" + markdown.slice(range.to);
	return markdown;
}
