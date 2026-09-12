import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { hash } from "../results/result-store";
export function draftLink(value?: string) {
	try {
		const url = new URL(value ?? "");
		if (
			url.protocol === "https:" &&
			url.hostname === "mp.weixin.qq.com" &&
			!url.username &&
			!url.password &&
			!url.port
		)
			return { url: url.href, label: "查看草稿" };
	} catch {}
	return { url: "https://mp.weixin.qq.com/", label: "打开公众号后台" };
}
export type DraftReceipt = {
	state: "started" | "unknown" | "completed";
	mediaId?: string;
	draftUrl?: string;
	resultId: string;
	appid: string;
	fingerprint?: string;
	sourcePath?: string;
	createdAt: number;
};
export async function relatedResults(
	root: string,
	resultId: string,
	sourcePath?: string,
): Promise<string[]> {
	const ids = new Set([resultId]);
	if (sourcePath)
		for (const id of await readdir(join(root, "results")).catch(
			() => [] as string[],
		)) {
			try {
				const data = JSON.parse(
					await readFile(
						join(root, "results", id, "result.json"),
						"utf8",
					),
				);
				if (data.sourcePath === sourcePath) ids.add(id);
			} catch {
				/* incomplete result */
			}
		}
	return [...ids];
}
/** Only recognize known receipt names and explicit article/account identities. */
export async function readDraftReceipts(
	root: string,
	resultIds: string[],
	appid: string,
	sourcePath?: string,
	strict = false,
): Promise<DraftReceipt[]> {
	const folder = join(root, "attempts");
	const receipts: DraftReceipt[] = [];
	const legacy = new Map(
		resultIds.map((id) => [hash(`${id}:${appid}`) + ".json", id]),
	);
	for (const name of await readdir(folder).catch(() => [] as string[])) {
		if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
		try {
			const value = JSON.parse(
				await readFile(join(folder, name), "utf8"),
			);
			if (!["started", "unknown", "completed"].includes(value.state)) {
				if (strict)
					throw new Error(
						"创建记录无法读取，请先核对公众号草稿箱，避免重复创建。",
					);
				continue;
			}
			const oldId = legacy.get(name);
			if (oldId)
				receipts.push({
					...value,
					resultId: oldId,
					appid,
					fingerprint: undefined,
					createdAt: (await stat(join(folder, name))).mtimeMs,
				});
			else if (
				typeof value.resultId === "string" &&
				value.appid === appid &&
				typeof value.fingerprint === "string" &&
				/^[a-f0-9]{64}$/.test(value.fingerprint) &&
				name ===
					hash(`${value.resultId}:${appid}:${value.fingerprint}`) +
						".json" &&
				(resultIds.includes(value.resultId) ||
					(sourcePath !== undefined &&
						value.sourcePath === sourcePath))
			) {
				receipts.push({
					...value,
					createdAt: Number.isFinite(value.createdAt)
						? value.createdAt
						: (await stat(join(folder, name))).mtimeMs,
				});
			}
		} catch {
			if (strict)
				throw new Error(
					"创建记录无法读取，请先核对公众号草稿箱，避免重复创建。",
				);
			/* invalid or incomplete receipt is not evidence of completion */
		}
	}
	return receipts;
}
export async function completedDraft(
	root: string,
	resultId: string,
	appid: string,
) {
	const receipts = await readDraftReceipts(root, [resultId], appid);
	const value = receipts
		.filter(
			(r) =>
				r.state === "completed" &&
				typeof r.mediaId === "string" &&
				r.mediaId.trim(),
		)
		.sort((a, b) => b.createdAt - a.createdAt)[0];
	return value ? draftLink(value.draftUrl) : null;
}

/** Without selected metadata, a receipt proves only previous creation, never current synchronization. */
export async function articleDraft(
	root: string,
	result: import("../results/result-store").Result,
	appid: string,
) {
	const ids = await relatedResults(root, result.id, result.sourcePath);
	const receipts = await readDraftReceipts(
		root,
		ids,
		appid,
		result.sourcePath,
	);
	const value = receipts
		.filter(
			(r) =>
				r.state === "completed" &&
				typeof r.mediaId === "string" &&
				r.mediaId.trim(),
		)
		.sort((a, b) => b.createdAt - a.createdAt)[0];
	return value
		? {
				...draftLink(value.draftUrl),
				createdAt: value.createdAt,
				current: false,
			}
		: null;
}
