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
export async function completedDraft(
	root: string,
	resultId: string,
	appid: string,
) {
	try {
		const value = JSON.parse(
			await readFile(
				join(root, "attempts", hash(`${resultId}:${appid}`) + ".json"),
				"utf8",
			),
		);
		return value.state === "completed" && value.mediaId
			? draftLink(value.draftUrl)
			: null;
	} catch {
		return null;
	}
}

/** Read existing durable receipts; refreshing a preview must not erase article history. */
export async function articleDraft(
	root: string,
	result: import("../results/result-store").Result,
	appid: string,
) {
	const candidates = [result];
	for (const id of await readdir(join(root, "results")).catch(
		() => [] as string[],
	)) {
		if (id === result.id) continue;
		try {
			const previous = JSON.parse(
				await readFile(
					join(root, "results", id, "result.json"),
					"utf8",
				),
			);
			if (previous.sourcePath === result.sourcePath)
				candidates.push(previous);
		} catch {
			/* An incomplete result cannot establish publication history. */
		}
	}
	const receipts = await Promise.all(
		candidates.map(async (candidate) => {
			const link = await completedDraft(root, candidate.id, appid);
			if (!link) return null;
			const info = await stat(
				join(
					root,
					"attempts",
					hash(`${candidate.id}:${appid}`) + ".json",
				),
			).catch(() => null);
			return {
				...link,
				createdAt: info?.mtimeMs ?? 0,
				current:
					candidate.id === result.id && result.state === "current",
			};
		}),
	);
	return (
		receipts
			.filter(
				(receipt): receipt is NonNullable<typeof receipt> => !!receipt,
			)
			.sort(
				(a, b) =>
					Number(b.current) - Number(a.current) ||
					b.createdAt - a.createdAt,
			)[0] ?? null
	);
}
