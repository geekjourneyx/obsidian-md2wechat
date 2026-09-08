import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const run = promisify(execFile);
const [binary, vault, sourceFile] = process.argv.slice(2);
if (!binary || !vault || !sourceFile)
	throw new Error(
		"Usage: node scripts/native-bridge-smoke.mjs <obsidian-cli> <vault> <source-file>",
	);
async function command(name, ...args) {
	const { stdout } = await run(
		binary,
		[`vault=${vault}`, `md2wechat-probe:${name}`, ...args],
		{ timeout: 15000 },
	);
	return JSON.parse(stdout.trim());
}
const capture = await command("capture");
assert.equal(capture.ok, true);
assert.equal(capture.marker, "EDITOR_VERSION");
assert.equal(await readFile(sourceFile, "utf8"), "DISK_VERSION");
const results = await Promise.all(
	["ROUND_TRIP_A", "ROUND_TRIP_B"].map(async (marker) => {
		const result = await command("present", `marker=${marker}`);
		assert.deepEqual(result, { ok: true, marker });
		return result;
	}),
);
console.log(
	JSON.stringify({ capture, results, sourceUnchanged: true }, null, 2),
);
