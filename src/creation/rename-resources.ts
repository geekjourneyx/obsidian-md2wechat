import type { ResultStore } from "../results/result-store";
import type { createCreationStore } from "./creation-store";
type CreationStore = ReturnType<typeof createCreationStore>;
export function renamedPath(
	path: string,
	oldPath: string,
	newPath: string,
): string {
	return path === oldPath || path.startsWith(oldPath + "/")
		? newPath + path.slice(oldPath.length)
		: path;
}
const queues = new WeakMap<ResultStore, Promise<void>>();
export function withResourceUpdate<T>(
	results: ResultStore,
	action: () => Promise<T>,
): Promise<T> {
	const previous = queues.get(results) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(action);
	const settled = next.then(() => undefined);
	queues.set(results, settled);
	void settled
		.finally(() => {
			if (queues.get(results) === settled) queues.delete(results);
		})
		.catch(() => undefined);
	return next;
}
export function renameResources(
	results: ResultStore,
	creation: CreationStore,
	oldPath: string,
	newPath: string,
): Promise<void> {
	return withResourceUpdate(results, () =>
		moveResources(results, creation, oldPath, newPath),
	);
}
/** Preflight both stores and all descendants before any movement. */
async function moveResources(
	results: ResultStore,
	creation: CreationStore,
	oldPath: string,
	newPath: string,
) {
	if (oldPath === newPath) return;
	const resultPaths = await results.sourcePaths(),
		creationPaths = await creation.sourcePaths();
	const sources = [...new Set([...resultPaths, ...creationPaths])].filter(
		(path) => renamedPath(path, oldPath, newPath) !== path,
	);
	for (const source of sources) {
		const target = renamedPath(source, oldPath, newPath);
		await results.canRenameSource(source, target);
		await creation.canRenameSource(source, target);
	}
	const undo: Array<() => Promise<void>> = [];
	try {
		for (const source of sources) {
			const target = renamedPath(source, oldPath, newPath);
			if (resultPaths.includes(source)) {
				await results.renameSource(source, target);
				undo.push(() => results.renameSource(target, source));
			}
			if (creationPaths.includes(source)) {
				await creation.renameSource(source, target);
				undo.push(() => creation.renameSource(target, source));
			}
		}
		await creation.renameAsset(oldPath, newPath);
	} catch (error) {
		let rollbackFailed = false;
		for (const action of undo.reverse())
			try {
				await action();
			} catch {
				rollbackFailed = true;
			}
		throw new Error(
			rollbackFailed
				? "文件已改名，但部分创作记录未能恢复。原记录未覆盖，请保留现有记录并检查存储权限。"
				: `文件已改名，创作记录未迁移：${error instanceof Error ? error.message : "请检查存储权限"}。`,
		);
	}
}
