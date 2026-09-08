import { mkdir, open, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
export type SourceAsset = {
	tokenStart: number;
	tokenEnd: number;
	originalTarget: string;
	localFile: string;
	replacementKind?: "wiki";
	alt?: string;
};
export type StageInput = {
	markdown: string;
	sourcePath: string;
	assets: readonly SourceAsset[];
};
export type StagedAsset = SourceAsset & {
	stagedTarget: string;
	sha256: string;
};
export type StageResult = {
	inputFile: string;
	workDir: string;
	bindings: readonly StagedAsset[];
};
const MiB = 1024 * 1024;
export async function stageSource(
	input: StageInput,
	directory: string,
): Promise<StageResult> {
	if (Buffer.byteLength(input.markdown) > 10 * MiB)
		throw new Error("文章超过 10 MB，请先缩短文章");
	const assets = [...input.assets].sort(
		(a, b) => a.tokenStart - b.tokenStart,
	);
	let end = 0;
	for (const asset of assets) {
		if (
			!Number.isInteger(asset.tokenStart) ||
			!Number.isInteger(asset.tokenEnd) ||
			asset.tokenStart < end ||
			asset.tokenEnd <= asset.tokenStart ||
			input.markdown.slice(asset.tokenStart, asset.tokenEnd) !==
				asset.originalTarget
		)
			throw new Error("图片位置已变化，请重新获取当前文章");
		end = asset.tokenEnd;
	}
	const workDir = resolve(directory);
	await mkdir(workDir, { mode: 0o700 }); // An existing directory is never a new request.
	await mkdir(join(workDir, "assets"), { mode: 0o700 });
	const bindings: StagedAsset[] = [];
	let total = Buffer.byteLength(input.markdown);
	const copies = new Map<string, { stagedTarget: string; sha256: string }>();
	for (const asset of assets) {
		let copy = copies.get(asset.localFile);
		if (!copy) {
			const handle = await open(asset.localFile, "r");
			let bytes: Buffer;
			try {
				const stat = await handle.stat();
				if (
					!stat.isFile() ||
					stat.size > 20 * MiB ||
					total + stat.size > 200 * MiB
				)
					throw new Error("图片太大或不是普通文件");
				bytes = await handle.readFile();
				if (bytes.length > 20 * MiB) throw new Error("图片太大");
			} finally {
				await handle.close();
			}
			total += bytes.length;
			const extension = extname(asset.localFile).toLowerCase();
			if (!/^\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(extension))
				throw new Error("不支持的图片类型");
			copy = {
				stagedTarget: `assets/asset-${copies.size + 1}${extension}`,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			};
			await writeFile(join(workDir, copy.stagedTarget), bytes, {
				flag: "wx",
				mode: 0o600,
			});
			copies.set(asset.localFile, copy);
		}
		bindings.push({
			...asset,
			...copy,
			localFile: join(workDir, copy.stagedTarget),
		});
	}
	let markdown = input.markdown;
	for (const asset of [...bindings].reverse())
		markdown =
			markdown.slice(0, asset.tokenStart) +
			(asset.replacementKind === "wiki"
				? `![${(asset.alt ?? "").replace(/[\[\]]/g, "")}](${asset.stagedTarget})`
				: asset.stagedTarget) +
			markdown.slice(asset.tokenEnd);
	const inputFile = join(workDir, "input.md");
	await writeFile(inputFile, markdown, { flag: "wx", mode: 0o600 });
	return { inputFile, workDir, bindings };
}
