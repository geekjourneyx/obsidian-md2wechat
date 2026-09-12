import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	writeFile,
	rename,
	rm,
	readdir,
} from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";

export type TitleCandidate = { id: string; text: string };
export type CoverCandidate = {
	id: string;
	file: string;
	label: string;
	savedPath?: string;
};
export type CandidateBatch<T> = {
	id: string;
	createdAt: number;
	sourceHash: string;
	items: T[];
};
export type CreationState = {
	titles: CandidateBatch<TitleCandidate>[];
	covers: CandidateBatch<CoverCandidate>[];
	illustrations?: CandidateBatch<CoverCandidate>[];
	selectedTitle?: string;
	selectedCover?: string;
	coverPath?: string;
};
type RecordFile = {
	schemaVersion: 1;
	sourcePath: string;
	state: CreationState;
};
const queues = new Map<string, Promise<unknown>>();
const empty = (): CreationState => ({ titles: [], covers: [] });
function vaultPath(value: string): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.includes("\0") ||
		value.includes("\\") ||
		isAbsolute(value) ||
		/^[a-z]:/i.test(value) ||
		value.split("/").some((p) => !p || p === "." || p === "..")
	)
		throw new Error("文件位置必须是笔记库内的相对路径");
	return value;
}
function text(value: string, max: number): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.includes("\0") ||
		Array.from(value.trim()).length > max
	)
		throw new Error("候选内容为空或过长");
	return value.trim();
}
function localFile(value: string): string {
	if (
		typeof value !== "string" ||
		!isAbsolute(value) ||
		value.includes("\0") ||
		value.replace(/\\/g, "/").split("/").includes("..")
	)
		throw new Error("候选图片必须使用安全的本地绝对路径");
	return value;
}
export function selectedTitle(state: CreationState): string | undefined {
	return state.titles
		.flatMap((batch) => batch.items)
		.find((item) => item.id === state.selectedTitle)?.text;
}
function validate(record: RecordFile, sourcePath?: string): RecordFile {
	if (
		!record ||
		record.schemaVersion !== 1 ||
		(sourcePath !== undefined && record.sourcePath !== sourcePath)
	)
		throw new Error("创作记录格式不正确");
	vaultPath(record.sourcePath);
	const state = record.state;
	if (!state || !Array.isArray(state.titles) || !Array.isArray(state.covers))
		throw new Error("创作记录格式不正确");
	for (const [kind, batches] of [
		["titles", state.titles],
		["covers", state.covers],
		["illustrations", state.illustrations ?? []],
	] as const) {
		if (!Array.isArray(batches)) throw new Error("配图记录格式不正确");
		if (batches.length > 100) throw new Error("候选批次过多");
		for (const batch of batches) {
			text(batch.id, 100);
			text(batch.sourceHash, 256);
			if (
				!Number.isFinite(batch.createdAt) ||
				!Array.isArray(batch.items) ||
				!batch.items.length ||
				batch.items.length > 20
			)
				throw new Error("候选批次格式不正确");
			for (const item of batch.items) {
				text(item.id, 100);
				if (kind === "titles") text((item as TitleCandidate).text, 32);
				else {
					const cover = item as CoverCandidate;
					localFile(cover.file);
					text(cover.label, 200);
					if (cover.savedPath !== undefined)
						vaultPath(cover.savedPath);
				}
			}
		}
	}
	if (state.selectedTitle !== undefined && !selectedTitle(state))
		throw new Error("所选标题不存在");
	if (
		state.selectedCover !== undefined &&
		!state.covers.some((b) =>
			b.items.some((i) => i.id === state.selectedCover),
		)
	)
		throw new Error("所选封面不存在");
	if (state.coverPath !== undefined) vaultPath(state.coverPath);
	return record;
}
export function createCreationStore(root: string) {
	root = resolve(root);
	const fileFor = (source: string) =>
		join(
			root,
			`${createHash("sha256").update(vaultPath(source)).digest("hex")}.json`,
		);
	function serial<T>(action: () => Promise<T>): Promise<T> {
		const previous = queues.get(root) ?? Promise.resolve();
		const next = previous.catch(() => undefined).then(action);
		queues.set(root, next);
		void next
			.finally(() => {
				if (queues.get(root) === next) queues.delete(root);
			})
			.catch(() => undefined);
		return next;
	}
	async function read(source: string): Promise<CreationState> {
		try {
			return validate(
				JSON.parse(await readFile(fileFor(source), "utf8")),
				source,
			).state;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT")
				return empty();
			throw error;
		}
	}
	async function save(source: string, state: CreationState) {
		const record = validate({
			schemaVersion: 1,
			sourcePath: source,
			state,
		});
		await mkdir(root, { recursive: true, mode: 0o700 });
		const file = fileFor(source),
			temporary = `${file}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, JSON.stringify(record), {
				flag: "wx",
				mode: 0o600,
			});
			await rename(temporary, file);
		} finally {
			await rm(temporary, { force: true });
		}
	}
	function update(source: string, mutate: (state: CreationState) => void) {
		return serial(async () => {
			const state = await read(source);
			mutate(state);
			await save(source, state);
			return state;
		});
	}
	function batch<T>(sourceHash: string, items: T[]): CandidateBatch<T> {
		if (!items.length || items.length > 20)
			throw new Error("每批候选需要 1 至 20 项");
		return {
			id: randomUUID(),
			createdAt: Date.now(),
			sourceHash: text(sourceHash, 256),
			items,
		};
	}
	return {
		sourcePaths: () =>
			serial(async () => {
				const paths: string[] = [];
				for (const file of await readdir(root).catch(
					() => [] as string[],
				)) {
					if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
					paths.push(
						validate(
							JSON.parse(
								await readFile(join(root, file), "utf8"),
							),
						).sourcePath,
					);
				}
				return paths;
			}),
		canRenameSource: (oldPath: string, newPath: string) =>
			serial(async () => {
				if (oldPath === newPath) return;
				try {
					await readFile(fileFor(newPath));
					throw new Error("目标文章已有创作记录，不能覆盖");
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
				}
			}),
		read: (source: string) => serial(() => read(source)),
		addTitles: (source: string, sourceHash: string, titles: string[]) =>
			update(source, (state) => {
				state.titles.push(
					batch(
						sourceHash,
						[
							...new Set(titles.map((title) => text(title, 32))),
						].map((title) => ({ id: randomUUID(), text: title })),
					),
				);
			}),
		addCovers: (
			source: string,
			sourceHash: string,
			covers: { file: string; label: string }[],
		) =>
			update(source, (state) => {
				state.covers.push(
					batch(
						sourceHash,
						covers.map((cover) => ({
							id: randomUUID(),
							file: localFile(cover.file),
							label: text(cover.label, 200),
						})),
					),
				);
			}),
		addIllustrations: (
			source: string,
			sourceHash: string,
			images: { file: string; label: string }[],
		) =>
			update(source, (state) => {
				(state.illustrations ??= []).push(
					batch(
						sourceHash,
						images.map((image) => ({
							id: randomUUID(),
							file: localFile(image.file),
							label: text(image.label, 200),
						})),
					),
				);
			}),
		saveIllustrationPath: (source: string, id: string, savedPath: string) =>
			update(source, (state) => {
				const image = state.illustrations
					?.flatMap((b) => b.items)
					.find((i) => i.id === id);
				if (!image) throw new Error("配图候选不存在");
				image.savedPath = vaultPath(savedPath);
			}),
		selectTitle: (source: string, id: string) =>
			update(source, (state) => {
				if (!state.titles.some((b) => b.items.some((i) => i.id === id)))
					throw new Error("标题候选不存在");
				state.selectedTitle = id;
			}),
		selectCover: (source: string, id: string, savedPath: string) =>
			update(source, (state) => {
				const cover = state.covers
					.flatMap((b) => b.items)
					.find((i) => i.id === id);
				if (!cover) throw new Error("封面候选不存在");
				cover.savedPath = vaultPath(savedPath);
				state.selectedCover = id;
				state.coverPath = savedPath;
			}),
		setCoverPath: (source: string, path: string) =>
			update(source, (state) => {
				state.coverPath = vaultPath(path);
				delete state.selectedCover;
			}),
		renameSource: (oldPath: string, newPath: string) =>
			serial(async () => {
				const oldFile = fileFor(oldPath),
					newFile = fileFor(newPath);
				if (oldFile === newFile) return;
				try {
					await readFile(newFile);
					throw new Error("目标文章已有创作记录，不能覆盖");
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT")
						throw error;
				}
				try {
					await readFile(oldFile);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT")
						return;
					throw error;
				}
				try {
					await save(newPath, await read(oldPath));
					await rm(oldFile);
				} catch (error) {
					try {
						await rm(newFile, { force: true });
					} catch {
						throw new Error(
							"创作记录移动失败，原记录保留，但新位置未能清理，请检查存储权限。",
						);
					}
					throw error;
				}
			}),
		renameAsset: (oldPath: string, newPath: string) =>
			serial(async () => {
				vaultPath(oldPath);
				vaultPath(newPath);
				const changes: Array<{
					sourcePath: string;
					before: CreationState;
					after: CreationState;
				}> = [];
				const files = await readdir(root).catch((error) => {
					if (error.code === "ENOENT") return [] as string[];
					throw error;
				});
				for (const file of files.filter((name) =>
					/^[a-f0-9]{64}\.json$/.test(name),
				)) {
					const record = validate(
						JSON.parse(await readFile(join(root, file), "utf8")),
					);
					const before = JSON.parse(
						JSON.stringify(record.state),
					) as CreationState;
					const move = (path: string) =>
						path === oldPath || path.startsWith(oldPath + "/")
							? newPath + path.slice(oldPath.length)
							: path;
					if (record.state.coverPath)
						record.state.coverPath = move(record.state.coverPath);
					for (const cover of [
						...record.state.covers,
						...(record.state.illustrations ?? []),
					].flatMap((batch) => batch.items))
						if (cover.savedPath)
							cover.savedPath = move(cover.savedPath);
					if (JSON.stringify(before) !== JSON.stringify(record.state))
						changes.push({
							sourcePath: record.sourcePath,
							before,
							after: record.state,
						});
				}
				try {
					for (const item of changes)
						await save(item.sourcePath, item.after);
				} catch (error) {
					let restoreFailed = false;
					for (const item of changes)
						try {
							await save(item.sourcePath, item.before);
						} catch {
							restoreFailed = true;
						}
					if (restoreFailed)
						throw new Error(
							"图片位置更新失败，部分记录未恢复，请保留现有记录并检查存储权限。",
						);
					throw error;
				}
			}),
	};
}
