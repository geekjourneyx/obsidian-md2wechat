import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL("./tests/obsidian-stub.ts", import.meta.url),
			),
		},
	},
});
