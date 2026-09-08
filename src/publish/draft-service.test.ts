import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash } from "../results/result-store";
import { createConfirmedDraft } from "./draft-service";
let root: string;
let calls: string[][];
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "md2wechat-draft-"));
	calls = [];
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});
const ok = (data: unknown) => ({
	success: true,
	code: "OK",
	message: "ok",
	schema_version: "v1",
	status: "completed",
	retryable: false,
	data,
});
async function input() {
	const htmlFile = join(root, "preview.html"),
		coverFile = join(root, "cover.png");
	await writeFile(htmlFile, '<p style="color:red">已审阅</p>');
	await writeFile(coverFile, "cover");
	await writeFile(join(root, "formatted.md"), "# 标题");
	return {
		resultId: "result-1",
		sourceHash: hash("原文"),
		htmlFile,
		htmlHash: hash('<p style="color:red">已审阅</p>'),
		account: { name: "test", appid: "wx-test", current: true },
		title: "标题",
		author: "作者",
		digest: "摘要",
		coverFile,
		coverHash: hash("cover"),
		assets: [],
		markdownFile: join(root, "formatted.md"),
	};
}
function runner(uncertain = false) {
	return {
		async run(args: readonly string[]) {
			calls.push([...args]);
			if (args[0] === "config")
				return ok({
					accounts: [
						{ name: "test", appid: "wx-test", current: true },
					],
				});
			if (args[0] === "inspect")
				return ok({ readiness: { draft_ready: true } });
			if (args[0] === "upload_image")
				return ok({
					media_id: "cover-id",
					wechat_url: "https://mmbiz.qpic.cn/cover",
				});
			if (args[0] === "create_draft") {
				const body = JSON.parse(await readFile(args[1], "utf8"));
				expect(body.articles[0].content).toBe(
					'<p style="color:red">已审阅</p>',
				);
				if (uncertain) throw new Error("connection lost");
				return ok({ media_id: "draft-id" });
			}
			throw new Error("unexpected " + args[0]);
		},
	} as any;
}
it("creates exactly the reviewed content once, including after restart and repeated confirmation", async () => {
	const draft = await input();
	const run = runner();
	const first = await createConfirmedDraft(root, draft, run, async () =>
		hash("原文"),
	);
	expect(first.kind).toBe("completed");
	const again = await createConfirmedDraft(root, draft, run, async () =>
		hash("原文"),
	);
	expect(again.kind).toBe("completed");
	expect(calls.filter((c) => c[0] === "create_draft")).toHaveLength(1);
	expect(calls.some((c) => ["preview", "convert"].includes(c[0]))).toBe(
		false,
	);
});
it("blocks changed source before any upload", async () => {
	const result = await createConfirmedDraft(
		root,
		await input(),
		runner(),
		async () => hash("changed"),
	);
	expect(result.kind).toBe("blocked");
	expect(
		calls.filter((c) => ["upload_image", "create_draft"].includes(c[0])),
	).toHaveLength(0);
});
it("does not retry a draft whose outcome was lost", async () => {
	const draft = await input();
	expect(
		(
			await createConfirmedDraft(root, draft, runner(true), async () =>
				hash("原文"),
			)
		).kind,
	).toBe("unknown");
	expect(
		(
			await createConfirmedDraft(root, draft, runner(), async () =>
				hash("原文"),
			)
		).kind,
	).toBe("unknown");
	expect(calls.filter((c) => c[0] === "create_draft")).toHaveLength(1);
});
it("allows only one concurrent confirmation across independent callers", async () => {
	const draft = await input();
	const run = runner();
	await Promise.all([
		createConfirmedDraft(root, draft, run, async () => hash("原文")),
		createConfirmedDraft(root, draft, run, async () => hash("原文")),
	]);
	expect(calls.filter((c) => c[0] === "create_draft")).toHaveLength(1);
});
