import type { CliRunner } from "../cli/contracts";
export type ImagePreset = {
	id: string;
	label: string;
	description: string;
	archetype: string;
	compatibleUseCases: string[];
};
const labels: Record<string, string> = {
	"cover-claude-warm": "封面 · 暖色编辑",
	"cover-data-visual": "封面 · 数据分析",
	"cover-default": "封面 · 通用",
	"cover-editorial": "封面 · 杂志评论",
	"cover-editorial-collage": "封面 · 手撕拼贴",
	"cover-hero": "封面 · 视觉主角",
	"cover-illustrated": "封面 · 亲和插画",
	"cover-metaphor": "封面 · 视觉隐喻",
	"cover-minimal": "封面 · 极简留白",
	"cover-semantic-concept": "封面 · 概念海报",
	"cover-suspense-black-gold": "封面 · 黑金悬念",
	"infographic-apple-keynote-premium": "信息图 · 苹果发布会",
	"infographic-bento": "信息图 · 模块总览",
	"infographic-claude-warm": "信息图 · 暖色总结",
	"infographic-comparison": "信息图 · 对比",
	"infographic-dark-ticket-cn": "信息图 · 暗黑票券",
	"infographic-dashboard": "信息图 · 数据看板",
	"infographic-default": "信息图 · 通用",
	"infographic-flat-vector-panorama": "信息图 · 扁平全景",
	"infographic-handdrawn-sketchnote": "信息图 · 手绘笔记",
	"infographic-hierarchy": "信息图 · 层级关系",
	"infographic-process": "信息图 · 步骤流程",
	"infographic-ticket-process": "信息图 · 流程票券",
	"infographic-timeline": "信息图 · 时间线",
	"infographic-victorian-engraving-banner": "信息图 · 复古版画",
};
export function parseImagePresets(data: unknown): ImagePreset[] {
	if (
		!data ||
		typeof data !== "object" ||
		!Array.isArray((data as any).prompts)
	)
		throw new Error("未能读取图片风格，请检查 md2wechat。");
	const seen = new Set<string>();
	return (data as any).prompts
		.filter(
			(p: any) =>
				p?.kind === "image" &&
				typeof p.name === "string" &&
				p.name.trim(),
		)
		.map((p: any) => {
			if (seen.has(p.name)) throw new Error("图片风格列表含有重复项目。");
			seen.add(p.name);
			const description =
				typeof p.description === "string" ? p.description : "";
			return {
				id: p.name,
				label:
					labels[p.name] ??
					(description || p.name.replace(/-/g, " ")),
				description,
				archetype: typeof p.archetype === "string" ? p.archetype : "",
				compatibleUseCases: Array.isArray(p.compatible_use_cases)
					? p.compatible_use_cases.filter(
							(v: unknown) => typeof v === "string",
						)
					: [],
			};
		});
}
export function imagePresetsFor(
	presets: ImagePreset[],
	kind: "cover" | "body",
): ImagePreset[] {
	return kind === "cover"
		? presets.filter(
				(p) =>
					p.archetype === "cover" ||
					p.compatibleUseCases.includes("cover"),
			)
		: [...presets].sort(
				(a, b) =>
					Number(b.archetype === "infographic") -
					Number(a.archetype === "infographic"),
			);
}
export async function loadImagePresets(
	runner: CliRunner,
	signal?: AbortSignal,
): Promise<ImagePreset[]> {
	const response = await runner.run(
		["prompts", "list", "--kind", "image", "--json"],
		{ signal },
	);
	if (!response.success)
		throw new Error("未能读取图片风格，请检查 md2wechat。");
	return parseImagePresets(response.data);
}
