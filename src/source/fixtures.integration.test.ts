import { locateCli } from "../cli/catalog-service";
import { it, expect, vi } from "vitest";
import { readFile, writeFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { resolveAssets, inspectionMarkdown } from "./resolve-assets";
import { stageSource } from "./stage-source";
import { createCliRunner } from "../cli/runner";
import { completed } from "../cli/catalog-service";
it("stages ten representative articles and resolves all local images in the actual CLI", async () => {
	// inspect is read-only; do not rely on a developer account configuration.
 vi.stubEnv("MD2WECHAT_API_KEY", "offline-inspect-test-only");
 const fixture = resolve("tests/fixtures/articles");
	const root = await mkdtemp(join(tmpdir(), "md2wechat-fixtures-"));
	try {
		for (const name of (await readdir(fixture)).filter((n) =>
			n.endsWith(".md"),
		)) {
			const original = await readFile(join(fixture, name), "utf8");
			const assets = await resolveAssets(original, async (target) =>
				join(fixture, target),
			);
			const staged = await stageSource(
				{ markdown: original, sourcePath: name, assets },
				join(root, name),
			);
			await writeFile(
				join(staged.workDir, "inspection.md"),
				inspectionMarkdown(await readFile(staged.inputFile, "utf8")),
			);
			const result = completed(
				await createCliRunner(
					await locateCli(process.env.MD2WECHAT_TEST_CLI),
				).run<any>([
					"inspect",
					join(staged.workDir, "inspection.md"),
					"--json",
				]),
			);
			expect(result.readiness.convert_ready, name).toBe(true);
			for (const asset of result.assets ?? [])
				expect(asset.exists, name).toBe(true);
			expect(await readFile(join(fixture, name), "utf8")).toBe(original);
		}
	} finally {
 vi.unstubAllEnvs();
		await rm(root, { recursive: true, force: true });
	}
}, 20000);
