import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export function publicAddress(address: string) {
	const value = address.toLowerCase();
	if (value.includes(":"))
		return (
			!["::", "::1"].includes(value) &&
			!value.startsWith("fc") &&
			!value.startsWith("fd") &&
			!value.startsWith("fe80") &&
			!value.startsWith("::ffff:")
		);
	const [a, b] = value.split(".").map(Number);
	return (
		a > 0 &&
		a < 224 &&
		a !== 10 &&
		a !== 127 &&
		!(a === 169 && b === 254) &&
		!(a === 172 && b >= 16 && b <= 31) &&
		!(a === 192 && b === 168) &&
		!(a === 100 && b >= 64 && b <= 127)
	);
}
export async function downloadImage(
	address: string,
	directory: string,
	redirects = 0,
): Promise<string> {
	const url = new URL(address);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		redirects > 3
	)
		throw new Error("网络图片需要可直接访问的 HTTPS 地址");
	const answers = await lookup(url.hostname, { all: true });
	if (!answers.length || answers.some((a) => !publicAddress(a.address)))
		throw new Error("网络图片不能指向本机或内网");
	const result = await new Promise<{
		bytes?: Buffer;
		type?: string;
		redirect?: string;
	}>((resolve, reject) => {
		const request = get(
			url,
			{
				lookup: ((_hostname: any, options: any, callback: any) => {
					if (options?.all) callback(null, answers);
					else callback(null, answers[0].address, answers[0].family);
				}) as any,
			},
			(response) => {
				if (
					response.statusCode &&
					response.statusCode >= 300 &&
					response.statusCode < 400 &&
					response.headers.location
				) {
					response.resume();
					resolve({
						redirect: new URL(response.headers.location!, url).href,
					});
					return;
				}
				if (response.statusCode !== 200) {
					response.resume();
					reject(new Error("网络图片下载失败"));
					return;
				}
				const type = (response.headers["content-type"] ?? "").split(
					";",
				)[0];
				if (
					![
						"image/png",
						"image/jpeg",
						"image/gif",
						"image/webp",
						"image/svg+xml",
						"image/avif",
					].includes(type)
				) {
					response.resume();
					reject(new Error("网络地址没有返回图片"));
					return;
				}
				const parts: Buffer[] = [];
				let size = 0;
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > 20 * 1024 * 1024) {
						request.destroy(new Error("网络图片超过 20 MB"));
						return;
					}
					parts.push(chunk);
				});
				response.once("end", () =>
					resolve({ bytes: Buffer.concat(parts), type }),
				);
				response.once("error", reject);
			},
		);
		request.setTimeout(15000, () =>
			request.destroy(new Error("网络图片下载超时")),
		);
		request.once("error", reject);
	});
	if (result.redirect)
		return downloadImage(result.redirect, directory, redirects + 1);
	if (!result.bytes?.length) throw new Error("网络图片为空");
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const extension = result
		.type!.split("/")[1]
		.replace("jpeg", "jpg")
		.replace("svg+xml", "svg");
	const file = join(directory, `${randomUUID()}.${extension}`);
	await writeFile(file, result.bytes, { flag: "wx", mode: 0o600 });
	return file;
}
