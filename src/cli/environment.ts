import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";

/** Inspect only installed runtime directory names; never evaluate shell configuration. */
export function runtimeDirectories(home = homedir()): string[] {
	const base = join(home, ".nvm", "versions", "node");
	try {
		return readdirSync(base)
			.filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
			.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
			.map((name) => join(base, name, "bin"));
	} catch {
		return [];
	}
}
/** Preserve the parent's chosen commands, then fill desktop launch omissions for this child only. */
export function cliEnvironment(executable: string): NodeJS.ProcessEnv {
	const pathKey =
		process.platform === "win32"
			? (Object.keys(process.env).find(
					(key) => key.toLowerCase() === "path",
				) ?? "PATH")
			: "PATH";
	const paths = [
		...(process.env[pathKey] ?? "").split(delimiter).filter(Boolean),
		...(isAbsolute(executable) ? [dirname(executable)] : []),
		join(homedir(), ".local", "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		join(homedir(), ".npm-global", "bin"),
		join(homedir(), ".volta", "bin"),
		...runtimeDirectories(),
		"/usr/bin",
		"/bin",
	];
	return { ...process.env, [pathKey]: [...new Set(paths)].join(delimiter) };
}
