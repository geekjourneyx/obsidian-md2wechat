import { readDraftReceipts, relatedResults } from "./draft-link";
import { randomUUID } from "node:crypto";
import { inspectionMarkdown } from "../source/resolve-assets";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { hash, atomicJSON, withLock } from "../results/result-store";
import type { CliRunner } from "../cli/contracts";
import { completed, type Account } from "../cli/catalog-service";
import { imageTargets, replaceImageTargets } from "./asset-bindings";
export type FrozenDraft = {
	sourcePath?: string;
	resultId: string;
	sourceHash: string;
	htmlFile: string;
	htmlHash: string;
	markdownFile: string;
	account: Account;
	title: string;
	author: string;
	digest: string;
	coverFile: string;
	coverHash: string;
	assets: readonly {
		stagedTarget: string;
		localFile: string;
		sha256: string;
	}[];
};
export type DraftOutcome =
	| { kind: "completed"; mediaId: string; draftUrl?: string }
	| { kind: "blocked"; message: string }
	| { kind: "unknown"; message: string };
export function draftFingerprint(
	input: Pick<FrozenDraft, "title" | "author" | "digest" | "coverHash">,
): string {
	return hash(
		JSON.stringify([
			input.title,
			input.author,
			input.digest,
			input.coverHash,
		]),
	);
}
type Attempt = {
	resultId: string;
	appid: string;
	fingerprint: string;
	sourcePath?: string;
	createdAt: number;
	state: "started" | "completed" | "unknown";
	mediaId?: string;
	draftUrl?: string;
	stage: string;
};
export async function createConfirmedDraft(
	root: string,
	input: FrozenDraft,
	runner: CliRunner,
	currentSourceHash: () => Promise<string>,
): Promise<DraftOutcome> {
	const fingerprint = draftFingerprint(input);
	const key = hash(`${input.resultId}:${input.account.appid}:${fingerprint}`);
	let sourcePath = input.sourcePath;
	if (!sourcePath)
		try {
			sourcePath = JSON.parse(
				await readFile(
					join(root, "results", input.resultId, "result.json"),
					"utf8",
				),
			).sourcePath;
		} catch {}
	const lockKey = hash(
		`${sourcePath ?? input.resultId}:${input.account.appid}`,
	);
	const folder = join(root, "attempts");
	await mkdir(folder, { recursive: true, mode: 0o700 });
	const record = join(folder, `${key}.json`);
	try {
		return await withLock(join(folder, `${lockKey}.lock`), async () => {
			const ids = await relatedResults(root, input.resultId, sourcePath);
			const receipts = await readDraftReceipts(
				root,
				ids,
				input.account.appid,
				sourcePath,
				true,
			);
			if (
				receipts.some(
					(r) =>
						r.state !== "completed" ||
						typeof r.mediaId !== "string" ||
						!r.mediaId.trim(),
				)
			)
				return {
					kind: "unknown" as const,
					message:
						"上次创建结果尚未确认，请先到公众号草稿箱核对；本插件不会重复创建。",
				};
			if (
				receipts.some(
					(r) =>
						r.resultId === input.resultId &&
						!r.fingerprint &&
						r.state === "completed",
				)
			)
				return {
					kind: "blocked" as const,
					message:
						"这份排版已有旧版创建记录，无法核对当时的标题和封面，请先到公众号草稿箱核对，避免重复创建。",
				};
			const previous = receipts.find(
				(r) =>
					r.resultId === input.resultId &&
					r.fingerprint === fingerprint &&
					r.state === "completed" &&
					r.mediaId,
			);
			if (previous)
				return {
					kind: "completed" as const,
					mediaId: previous.mediaId!,
					draftUrl: previous.draftUrl,
				};
			const html = await readFile(input.htmlFile, "utf8");
			const cover = await readFile(input.coverFile);
			if (
				(await currentSourceHash()) !== input.sourceHash ||
				hash(html) !== input.htmlHash ||
				hash(cover) !== input.coverHash
			)
				return {
					kind: "blocked" as const,
					message: "文章、排版或封面发生变化，请重新确认",
				};
			const accountArgs = input.account.name
				? ["--wechat-account", input.account.name]
				: [];
			const verifyAccount = async () => {
				const data = completed(
					await runner.run<{
						accounts: Account[];
						current?: Account;
					}>(["config", "wechat-accounts", "--json"]),
				);
				const actual = input.account.name
					? data.accounts.find((a) => a.name === input.account.name)
					: data.current;
				if (actual?.appid !== input.account.appid)
					throw new Error("公众号账号已变化，请重新确认");
			};
			await verifyAccount();
			const inspectionFile = join(
				dirname(input.markdownFile),
				`.inspect-${randomUUID()}.md`,
			);
			await writeFile(
				inspectionFile,
				inspectionMarkdown(await readFile(input.markdownFile, "utf8")),
				{ flag: "wx", mode: 0o600 },
			);
			let inspection: { readiness: { draft_ready: boolean } };
			try {
				inspection = completed(
					await runner.run<{ readiness: { draft_ready: boolean } }>([
						"inspect",
						inspectionFile,
						"--draft",
						"--cover",
						input.coverFile,
						"--title",
						input.title,
						"--author",
						input.author,
						"--digest",
						input.digest,
						...accountArgs,
						"--json",
					]),
				);
			} finally {
				await rm(inspectionFile);
			}
			if (!inspection.readiness.draft_ready)
				return {
					kind: "blocked" as const,
					message: "发布资料尚未齐全，请检查标题、封面和账号配置",
				};
			const targets = imageTargets(html);
			const assets = new Map<string, { bytes: Buffer; file: string }>();
			for (const target of targets) {
				const asset = input.assets.find(
					(a) => a.stagedTarget === target || a.localFile === target,
				);
				if (!asset) throw new Error("排版包含未确认的图片，请重新排版");
				const bytes = await readFile(asset.localFile);
				if (hash(bytes) !== asset.sha256)
					throw new Error("图片已变化，请重新排版");
				assets.set(target, { bytes, file: asset.localFile });
			}
			if ((await currentSourceHash()) !== input.sourceHash)
				return {
					kind: "blocked" as const,
					message: "原文已更新，请重新排版",
				};
			const frozen = join(folder, key);
			await mkdir(frozen, { mode: 0o700 });
			const coverFile = join(frozen, "cover" + extname(input.coverFile));
			await writeFile(coverFile, cover, { flag: "wx", mode: 0o600 });
			let count = 0;
			for (const asset of assets.values()) {
				const file = join(
					frozen,
					`asset-${++count}${extname(asset.file)}`,
				);
				await writeFile(file, asset.bytes, { flag: "wx", mode: 0o600 });
				asset.file = file;
			}
			const attempt: Attempt = {
				resultId: input.resultId,
				appid: input.account.appid,
				fingerprint,
				sourcePath,
				createdAt: Date.now(),
				state: "started",
				stage: "准备上传",
			};
			await atomicJSON(record, attempt);
			try {
				const urls = new Map<string, string>();
				for (const [target, asset] of assets) {
					await verifyAccount();
					const uploaded = completed(
						await runner.run<{
							media_id: string;
							wechat_url: string;
						}>([
							"upload_image",
							asset.file,
							...accountArgs,
							"--json",
						]),
					);
					if (
						!uploaded.media_id ||
						!/^https:\/\//.test(uploaded.wechat_url)
					)
						throw new Error("图片上传未返回完整结果");
					urls.set(target, uploaded.wechat_url);
					attempt.stage = "正文图片已上传";
					await atomicJSON(record, attempt);
				}
				await verifyAccount();
				const uploadedCover = completed(
					await runner.run<{ media_id: string }>([
						"upload_image",
						coverFile,
						...accountArgs,
						"--json",
					]),
				);
				if (!uploadedCover.media_id)
					throw new Error("封面上传未返回结果");
				attempt.stage = "封面已上传";
				await atomicJSON(record, attempt);
				const jsonFile = join(frozen, "draft.json");
				await atomicJSON(jsonFile, {
					articles: [
						{
							title: input.title,
							author: input.author,
							digest: input.digest,
							content: replaceImageTargets(html, urls),
							thumb_media_id: uploadedCover.media_id,
						},
					],
				});
				await verifyAccount();
				attempt.stage = "已请求创建草稿";
				await atomicJSON(record, attempt);
				const draft = completed(
					await runner.run<{ media_id: string; draft_url?: string }>([
						"create_draft",
						jsonFile,
						...accountArgs,
						"--json",
					]),
				);
				if (
					typeof draft.media_id !== "string" ||
					!draft.media_id.trim()
				)
					throw new Error("创建未返回草稿编号");
				await atomicJSON(record, {
					...attempt,
					state: "completed",
					stage: "草稿已创建",
					mediaId: draft.media_id,
					draftUrl: draft.draft_url,
				});
				return {
					kind: "completed" as const,
					mediaId: draft.media_id,
					draftUrl: draft.draft_url,
				};
			} catch {
				await atomicJSON(record, { ...attempt, state: "unknown" });
				return {
					kind: "unknown" as const,
					message: `${attempt.stage}，后续结果尚未确认。请先到公众号核对，避免重复创建。`,
				};
			}
		});
	} catch (e) {
		return {
			kind: "blocked",
			message:
				(e as NodeJS.ErrnoException).code === "EEXIST"
					? "这份排版正在处理，请等待结果"
					: e instanceof Error
						? e.message
						: String(e),
		};
	}
}
