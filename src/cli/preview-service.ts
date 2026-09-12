import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CliRunner } from "./contracts";
import { completed } from "./catalog-service";
import type { Capture, ResultFiles } from "../results/result-store";
export async function renderPreview(
	runner: CliRunner,
	request: Capture,
	markdown: string,
	theme: string,
	fontSize = "medium",
	signal?: AbortSignal,
): Promise<ResultFiles> {
	const files = {
		markdown: join(request.workDir, "layout.md"),
		preview: join(request.workDir, "preview.html"),
		response: join(request.workDir, "preview-response.json"),
	};
	await writeFile(files.markdown, markdown, { flag: "wx", mode: 0o600 });
	if (/^:::/m.test(markdown))
		completed(
			await runner.run(
				["layout", "validate", "--file", files.markdown, "--json"],
				{ signal },
			),
		);
	completed(
		await runner.run(["inspect", files.markdown, "--json"], { signal }),
	);
	const response = await runner.run<{ output_file: string }>(
		[
			"preview",
			files.markdown,
			"--theme",
			theme,
			"--font-size",
			fontSize,
			"--output",
			files.preview,
			"--json",
		],
		{ signal },
	);
	const data = completed(response);
	if (
		resolve(data.output_file) !== files.preview ||
		(await readFile(files.preview)).length === 0
	)
		throw new Error("没有生成本次预览");
	await writeFile(files.response, JSON.stringify(response), {
		flag: "wx",
		mode: 0o600,
	});
	return files;
}
