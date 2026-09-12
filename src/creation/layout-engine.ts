import { parser, Table } from "@lezer/markdown";
export type LayoutKind =
	"callout" | "quote" | "steps" | "checklist" | "compare";
export const layoutNames: Record<LayoutKind, string> = {
	callout: "重点提示",
	quote: "重点摘录",
	steps: "编号步骤",
	checklist: "检查清单",
	compare: "对比展示",
};
export type LayoutBlock = {
	index: number;
	from: number;
	to: number;
	text: string;
	kinds: LayoutKind[];
};
export type Enhancement = { index: number; kind: LayoutKind; reason: string };
export type LayoutChange = {
	original: string;
	replacement: string;
	reason: string;
	kind: LayoutKind;
};
export function parseAgentJSON(text: string): any {
	try {
		return JSON.parse(
			text
				.trim()
				.replace(/^```(?:json)?\s*\n?/, "")
				.replace(/\n?```$/, ""),
		);
	} catch {
		throw new Error("AI 没有返回完整结果，请重试；已有成果已保留。");
	}
}
function rows(text: string) {
	return text
		.split("\n")
		.map((l) => l.replace(/^\s*(?:\d+[.)]|[-*+])\s+/, "").trim());
}
function pairs(text: string): string[][] {
	return rows(text).map((l) => {
		const m = l.match(/^([^：:]+)[：:]\s*(.+)$/);
		return m ? [m[1], m[2]] : [];
	});
}
export function layoutBlocks(markdown: string): LayoutBlock[] {
	const excluded: { from: number; to: number }[] = [];
	const front = markdown.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
	if (front) excluded.push({ from: 0, to: front[0].length });
	for (const match of markdown.matchAll(/^:::[^\n]*\n[\s\S]*?^:::\s*$/gm))
		excluded.push({
			from: match.index!,
			to: match.index! + match[0].length,
		});
	const blocks: LayoutBlock[] = [];
	const tree = parser.configure(Table).parse(markdown);
	let node = tree.topNode.firstChild;
	while (node) {
		const text = markdown.slice(node.from, node.to);
		let kinds: LayoutKind[] = [];
		if (
			!excluded.some((x) => node!.from < x.to && node!.to > x.from) &&
			!/[<>]|!\[|\[\[|:::/.test(text)
		) {
			if (node.name === "Table") {
				const table = tableRows(text);
				if (
					table.length >= 3 &&
					table.every((r) => r.length === 2) &&
					table[0].every((c) => c && !/[\[\]]/.test(c)) &&
					table
						.slice(2)
						.every((r) =>
							r.every((c) => /^([^：:]+)[：:]\s*(.+)$/.test(c)),
						)
				)
					kinds = ["compare"];
			}
			if (
				node.name === "Paragraph" &&
				!text.includes("\n") &&
				text.length <= 500
			)
				kinds = ["callout", "quote"];
			if (
				(node.name === "OrderedList" || node.name === "BulletList") &&
				!text.includes("|") &&
				rows(text).length >= 2 &&
				rows(text).every((l) => l.length > 0)
			) {
				kinds = ["checklist"];
				if (pairs(text).every((p) => p.length === 2))
					kinds.unshift("steps");
			}
		}
		if (kinds.length)
			blocks.push({
				index: blocks.length,
				from: node.from,
				to: node.to,
				text,
				kinds,
			});
		node = node.nextSibling;
	}
	return blocks;
}
function tableRows(text: string) {
	return text.split("\n").map((l) =>
		l
			.trim()
			.replace(/^\||\|$/g, "")
			.split("|")
			.map((c) => c.trim()),
	);
}
export function renderModule(block: LayoutBlock, kind: LayoutKind): string {
	if (!block.kinds.includes(kind))
		throw new Error("这段内容不适合该展示方式");
	switch (kind) {
		case "callout":
			return `:::callout\n${block.text}\n:::`;
		case "quote":
			return `:::quote\nquote: ${block.text}\n:::`;
		case "steps":
			return `:::steps\n${pairs(block.text)
				.map(
					(p, i) =>
						`${String(i + 1).padStart(2, "0")} | ${p[0]} | ${p[1]}`,
				)
				.join("\n")}\n:::`;
		case "checklist":
			return `:::checklist\n${rows(block.text)
				.map((l) => `pending | ${l}`)
				.join("\n")}\n:::`;
		case "compare": {
			const table = tableRows(block.text);
			return `:::compare[${table[0].join(" | ")}]\n${table
				.slice(2)
				.map((row) =>
					row
						.flatMap((cell) => {
							const match = cell.match(
								/^([^：:]+)[：:]\s*(.+)$/,
							)!;
							return [match[1], match[2]];
						})
						.join(" | "),
				)
				.join("\n")}\n:::`;
		}
		default:
			throw new Error("暂不支持这段内容的展示方式");
	}
}
export function applyEnhancements(
	markdown: string,
	suggestions: Enhancement[],
) {
	if (!Array.isArray(suggestions) || suggestions.length > 3)
		throw new Error("本次增强最多处理三处，请重试");
	const blocks = layoutBlocks(markdown);
	const selected = new Set<number>();
	const changes: LayoutChange[] = [];
	const edits = suggestions.map((s) => {
		const b = blocks.find((b) => b.index === s.index);
		if (!b || selected.has(b.index))
			throw new Error("增强位置无效，请重新生成");
		selected.add(b.index);
		const replacement = renderModule(b, s.kind);
		changes.push({
			original: b.text,
			replacement,
			kind: s.kind,
			reason:
				typeof s.reason === "string"
					? s.reason.slice(0, 200)
					: "改善阅读",
		});
		return { ...b, replacement };
	});
	let output = markdown;
	for (const e of edits.sort((a, b) => b.from - a.from))
		output = output.slice(0, e.from) + e.replacement + output.slice(e.to);
	return { markdown: output, changes };
}
