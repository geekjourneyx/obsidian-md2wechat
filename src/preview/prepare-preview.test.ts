// @vitest-environment jsdom
import { it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePreview } from "./prepare-preview";
import { hash, type Result } from "../results/result-store";
it("isolates display HTML without changing the reviewed file", async () => {
	const dir = await mkdtemp(join(tmpdir(), "preview-"));
	try {
		const html = "<p>正文</p><script>alert(1)</script>";
		const file = join(dir, "preview.html");
		await writeFile(file, html);
		const result = {
			htmlFile: file,
			htmlHash: hash(html),
			assets: [],
		} as unknown as Result;
		const display = await preparePreview(result, document);
		expect(display.html).not.toContain("<script>");
		expect(display.html).toContain("default-src 'none'");
		expect(await readFile(file, "utf8")).toBe(html);
		await writeFile(file, "changed");
		await expect(preparePreview(result, document)).rejects.toThrow(/修改/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
