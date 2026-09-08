import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { Result } from "../results/result-store";
import { hash } from "../results/result-store";
export async function preparePreview(
	result: Result,
	document: Document,
): Promise<{ html: string; hasLocalImages: boolean }> {
	const original = await readFile(result.htmlFile, "utf8");
	if (hash(original) !== result.htmlHash)
		throw new Error("保存的排版已被修改，请重新排版");
	const parser = new document.defaultView!.DOMParser();
	const parsed = parser.parseFromString(original, "text/html");
	const known = new Map<string, string>();
	for (const asset of result.assets) {
		const bytes = await readFile(asset.localFile);
		if (hash(bytes) !== asset.sha256) throw new Error("排版图片已被修改");
		const type = extname(asset.localFile)
			.slice(1)
			.replace("jpg", "jpeg")
			.replace("svg", "svg+xml");
		const url = `data:image/${type};base64,${bytes.toString("base64")}`;
		known.set(asset.stagedTarget, url);
		known.set(asset.localFile, url);
	}
	let hasLocalImages = false;
	for (const img of Array.from(parsed.querySelectorAll("img"))) {
		const src = img.getAttribute("src") ?? "";
		const local = known.get(src);
		if (local) {
			img.setAttribute("src", local);
			hasLocalImages = true;
		} else if (!src.startsWith("data:image/"))
			throw new Error("预览包含尚未固定的图片，请重新获取文章");
		img.removeAttribute("srcset");
	}
	// The saved publishing HTML stays byte-for-byte unchanged; this is display-only.
	for (const node of Array.from(
		parsed.querySelectorAll(
			"script,iframe,object,embed,base,link,meta[http-equiv]",
		),
	))
		node.remove();
	const csp = parsed.createElement("meta");
	csp.httpEquiv = "Content-Security-Policy";
	csp.content =
		"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";
	parsed.head.prepend(csp);
	const style = parsed.createElement("style");
	style.textContent =
		"html{background:white;color:#202124}body{margin:0;padding:20px 16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre,table{max-width:100%;overflow:auto}";
	parsed.head.append(style);
	return {
		html: "<!doctype html>" + parsed.documentElement.outerHTML,
		hasLocalImages,
	};
}
