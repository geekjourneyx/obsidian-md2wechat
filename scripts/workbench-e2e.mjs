import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
const run = promisify(execFile);
const [obsidian, cli, vault, source] = process.argv.slice(2);
if (!source)
	throw new Error(
		"Usage: node scripts/workbench-e2e.mjs <obsidian-cli> <md2wechat> <vault> <source>",
	);
const native = async (command, ...args) =>
	JSON.parse(
		(
			await run(obsidian, [`vault=${vault}`, command, ...args], {
				timeout: 20000,
			})
		).stdout,
	);
const capture = await native("md2wechat-publisher:capture", `source=${source}`);
const markdown = await readFile(capture.inputFile, "utf8");
const formatted = join(capture.workDir, "formatted.md");
const preview = join(capture.workDir, "preview.html");
const response = join(capture.workDir, "preview-response.json");
await writeFile(formatted, markdown);
const converted = await run(
	cli,
	["preview", formatted, "--output", preview, "--json"],
	{ timeout: 120000, env: process.env },
);
const envelope = JSON.parse(converted.stdout);
assert.equal(envelope.code, "PREVIEW_READY");
await writeFile(response, converted.stdout);
const presented = await native(
	"md2wechat-publisher:present",
	`request=${capture.requestId}`,
	`markdown=${formatted}`,
	`preview=${preview}`,
	`response=${response}`,
);
assert.equal(presented.state, "presented");
console.log(
	JSON.stringify(
		{
			requestId: capture.requestId,
			source,
			capturedBytes: Buffer.byteLength(markdown),
			previewBytes: (await readFile(preview)).length,
			presented,
		},
		null,
		2,
	),
);
