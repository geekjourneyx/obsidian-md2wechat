import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	writeFile,
	rename,
	realpath,
	stat,
	rm,
} from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import {
	stageSource,
	type StageInput,
	type StagedAsset,
} from "../source/stage-source";
export const hash = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");
export type Capture = {
	schemaVersion: 1;
	requestId: string;
	sourcePath: string;
	sourceHash: string;
	inputFile: string;
	workDir: string;
	assets: readonly StagedAsset[];
};
export type Result = {
	schemaVersion: 1;
	id: string;
	requestId: string;
	sourcePath: string;
	sourceHash: string;
	markdownFile: string;
	markdownHash: string;
	htmlFile: string;
	htmlHash: string;
	previewResponseFile: string;
	assets: readonly StagedAsset[];
	state: "current" | "source_changed";
	createdAt: number;
};
export type ResultFiles = {
	markdown: string;
	preview: string;
	response: string;
};
type Index = { latest?: string; current?: string; previous?: string };
export async function atomicJSON(file: string, data: unknown) {
	const temp = `${file}.${randomUUID()}.tmp`;
	await writeFile(temp, JSON.stringify(data), { flag: "wx", mode: 0o600 });
	await rename(temp, file);
}
async function optionalJSON<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw e;
	}
}
export async function withLock<T>(
	directory: string,
	action: () => Promise<T>,
): Promise<T> {
	await mkdir(directory, { mode: 0o700 });
	try {
		return await action();
	} finally {
		await rm(directory, { recursive: true });
	}
}
export function createResultStore(root: string) {
	const key = (source: string) => hash(source);
	const indexFile = (source: string) =>
		join(root, "index", `${key(source)}.json`);
	async function init() {
		for (const folder of ["index", "requests", "work", "results"])
			await mkdir(join(root, folder), { recursive: true, mode: 0o700 });
	}
	async function request(id: string) {
		if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("找不到这次排版请求");
		const captured = await optionalJSON<Capture>(
			join(root, "requests", `${id}.json`),
		);
		if (!captured) throw new Error("这次排版请求不存在，请重新获取文章");
		return captured;
	}
	async function checkedFile(file: string, workDir: string, limit: number) {
		const actual = await realpath(file);
		const base = await realpath(workDir);
		const rel = relative(base, actual);
		if (!rel || rel.startsWith("..") || isAbsolute(rel))
			throw new Error("结果文件不属于这次排版");
		const info = await stat(actual);
		if (!info.isFile() || info.size === 0 || info.size > limit)
			throw new Error("结果文件为空或太大");
		const bytes = await readFile(actual);
		if (bytes.length > limit) throw new Error("结果文件太大");
		return bytes;
	}
	return {
		request,
		async capture(input: StageInput): Promise<Capture> {
			await init();
			return withLock(
				join(root, `source-${key(input.sourcePath)}.lock`),
				async () => {
					const requestId = randomUUID();
					const staged = await stageSource(
						input,
						join(root, "work", requestId),
					);
					const captured: Capture = {
						schemaVersion: 1,
						requestId,
						sourcePath: input.sourcePath,
						sourceHash: hash(input.markdown),
						...staged,
						assets: staged.bindings,
					};
					await atomicJSON(
						join(root, "requests", `${requestId}.json`),
						captured,
					);
					const index =
						(await optionalJSON<Index>(
							indexFile(input.sourcePath),
						)) ?? {};
					await atomicJSON(indexFile(input.sourcePath), {
						...index,
						latest: requestId,
					});
					return captured;
				},
			);
		},
		async present(
			id: string,
			files: ResultFiles,
			currentMarkdown: string,
		): Promise<
			| Result
			| { state: "superseded"; id?: undefined; htmlFile?: undefined }
		> {
			const captured = await request(id);
			return withLock(
				join(root, `source-${key(captured.sourcePath)}.lock`),
				async () => {
					const index =
						(await optionalJSON<Index>(
							indexFile(captured.sourcePath),
						)) ?? {};
					if (index.latest !== id)
						return { state: "superseded" as const };
					const markdown = await checkedFile(
						files.markdown,
						captured.workDir,
						10 * 1024 * 1024,
					);
					const html = await checkedFile(
						files.preview,
						captured.workDir,
						20 * 1024 * 1024,
					);
					const responseBytes = await checkedFile(
						files.response,
						captured.workDir,
						10 * 1024 * 1024,
					);
					const response = JSON.parse(responseBytes.toString());
					if (
						response.success !== true ||
						response.status !== "completed" ||
						response.schema_version !== "v1" ||
						response.code !== "PREVIEW_READY" ||
						response.data?.render?.exact_html !== true ||
						response.data?.render?.mode !== "api" ||
						!response.data?.inspect?.source_file ||
						(await realpath(response.data.inspect.source_file)) !==
							(await realpath(files.markdown)) ||
						(await realpath(response.data.output_file)) !==
							(await realpath(files.preview))
					)
						throw new Error("排版还没有生成完整预览，请先完成排版");
					const resultId = hash(
						`${id}:${hash(markdown)}:${hash(html)}`,
					);
					if (index.current === resultId) {
						const existing = await optionalJSON<Result>(
							join(root, "results", resultId, "result.json"),
						);
						if (!existing) throw new Error("已保存的结果缺失");
						return {
							...existing,
							state:
								hash(currentMarkdown) === existing.sourceHash
									? ("current" as const)
									: ("source_changed" as const),
						};
					}
					if (index.current) {
						const old = await optionalJSON<Result>(
							join(root, "results", index.current, "result.json"),
						);
						if (old?.requestId === id)
							throw new Error(
								"已接收的结果被改动，请重新发起排版",
							);
					}
					const finalDirectory = join(root, "results", resultId);
					const recovered = await optionalJSON<Result>(
						join(finalDirectory, "result.json"),
					);
					if (
						recovered &&
						recovered.htmlHash === hash(html) &&
						recovered.markdownHash === hash(markdown)
					) {
						await atomicJSON(indexFile(captured.sourcePath), {
							...index,
							current: resultId,
							previous: index.current,
						});
						return {
							...recovered,
							state:
								hash(currentMarkdown) === captured.sourceHash
									? ("current" as const)
									: ("source_changed" as const),
						};
					}
					const directory = `${finalDirectory}.pending-${randomUUID()}`;
					await mkdir(directory, { mode: 0o700 });
					await mkdir(join(directory, "assets"), { mode: 0o700 });
					const assets: StagedAsset[] = [];
					for (const asset of captured.assets) {
						const bytes = await checkedFile(
							asset.localFile,
							captured.workDir,
							20 * 1024 * 1024,
						);
						if (hash(bytes) !== asset.sha256)
							throw new Error(
								"图片在排版期间发生变化，请重新获取文章",
							);
						const localFile = join(directory, asset.stagedTarget);
						if (
							!assets.some(
								(a) => a.stagedTarget === asset.stagedTarget,
							)
						)
							await writeFile(localFile, bytes, {
								flag: "wx",
								mode: 0o600,
							});
						assets.push({
							...asset,
							localFile: join(finalDirectory, asset.stagedTarget),
						});
					}
					const result: Result = {
						schemaVersion: 1,
						id: resultId,
						requestId: id,
						sourcePath: captured.sourcePath,
						sourceHash: captured.sourceHash,
						markdownFile: join(directory, "formatted.md"),
						markdownHash: hash(markdown),
						htmlFile: join(directory, "preview.html"),
						htmlHash: hash(html),
						previewResponseFile: join(
							directory,
							"preview-response.json",
						),
						assets,
						state:
							hash(currentMarkdown) === captured.sourceHash
								? "current"
								: "source_changed",
						createdAt: Date.now(),
					};
					await writeFile(result.markdownFile, markdown, {
						flag: "wx",
						mode: 0o600,
					});
					await writeFile(result.htmlFile, html, {
						flag: "wx",
						mode: 0o600,
					});
					await writeFile(result.previewResponseFile, responseBytes, {
						flag: "wx",
						mode: 0o600,
					});
					result.markdownFile = join(finalDirectory, "formatted.md");
					result.htmlFile = join(finalDirectory, "preview.html");
					result.previewResponseFile = join(
						finalDirectory,
						"preview-response.json",
					);
					await atomicJSON(join(directory, "result.json"), result);
					await rename(directory, finalDirectory);
					await atomicJSON(indexFile(captured.sourcePath), {
						...index,
						current: resultId,
						previous: index.current,
					});
					return result;
				},
			);
		},
		async current(
			sourcePath: string,
			markdown?: string,
		): Promise<Result | null> {
			const index = await optionalJSON<Index>(indexFile(sourcePath));
			if (!index?.current) return null;
			const result = await optionalJSON<Result>(
				join(root, "results", index.current, "result.json"),
			);
			if (!result) return null;
			return {
				...result,
				sourcePath,
				state:
					markdown !== undefined &&
					hash(markdown) === result.sourceHash
						? "current"
						: "source_changed",
			};
		},
		async renameSource(oldPath: string, newPath: string) {
			await init();
			const index = await optionalJSON<Index>(indexFile(oldPath));
			if (index) {
				await atomicJSON(indexFile(newPath), {
					...index,
					latest: undefined,
				});
				await rm(indexFile(oldPath));
			}
		},
	};
}
export type ResultStore = ReturnType<typeof createResultStore>;
