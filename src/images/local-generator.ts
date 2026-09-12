import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { publicAddress } from "../source/remote-image";

interface ImageConfig {
	base: URL;
	model: string;
	size: string;
	key: string;
}
const failure = () => new Error("图片生成或保存失败，请检查现有生图配置后重试");
const cancelled = () => new Error("图片生成已取消");
function check(signal?: AbortSignal) {
	if (signal?.aborted) throw cancelled();
}
function safeUrl(value: string): URL {
	const url = new URL(value);
	const host = url.hostname.toLowerCase();
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.hash ||
		/(^|\.)(weixin\.qq\.com|wechat\.com|weixin\.com|wechatpay\.cn)$/.test(
			host,
		) ||
		host === "localhost" ||
		host.endsWith(".localhost")
	)
		throw failure();
	return url;
}
async function configuration(
	cliPath: string,
	secret: boolean,
	signal?: AbortSignal,
): Promise<ImageConfig> {
	check(signal);
	return new Promise((resolveConfig, reject) => {
		execFile(
			cliPath,
			["config", "show", "--json", ...(secret ? ["--show-secret"] : [])],
			{
				encoding: "utf8",
				timeout: 10000,
				maxBuffer: 1024 * 1024,
				windowsHide: true,
				signal,
			},
			(error, stdout) => {
				if (error) {
					reject(signal?.aborted ? cancelled() : failure());
					return;
				}
				try {
					const envelope = JSON.parse(stdout);
					stdout = "";
					const c = envelope?.data?.config;
					if (
						envelope?.success !== true ||
						!c ||
						c.image_provider !== "volcengine" ||
						typeof c.image_api_key !== "string" ||
						!c.image_api_key.trim() ||
						typeof c.image_api_base !== "string" ||
						typeof c.image_model !== "string" ||
						!c.image_model.trim()
					)
						throw failure();
					const base = safeUrl(c.image_api_base);
					if (base.search) throw failure();
					const config = {
						base,
						model: c.image_model,
						size:
							typeof c.image_size === "string" && c.image_size
								? c.image_size
								: "2K",
						key: secret ? c.image_api_key : "",
					};
					// Do not retain unrelated configuration (including WeChat credentials).
					for (const key of Object.keys(c)) delete c[key];
					resolveConfig(config);
				} catch {
					stdout = "";
					reject(failure());
				}
			},
		);
	});
}
export async function imageReadiness(
	cliPath: string,
): Promise<{ available: boolean; message: string }> {
	try {
		await configuration(cliPath, false);
		return {
			available: true,
			message: "可使用现有火山生图配置；生成图片可能产生费用",
		};
	} catch {
		return {
			available: false,
			message: "请在 md2wechat 中配置火山生图；当前尚不能生成本地图片",
		};
	}
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	check(signal);
	return new Promise((resolveValue, reject) => {
		const abort = () => reject(cancelled());
		signal.addEventListener("abort", abort, { once: true });
		promise
			.then(resolveValue, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}
async function retrieve(
	url: URL,
	signal: AbortSignal,
	max: number,
	body?: string,
	key?: string,
): Promise<{ bytes: Buffer; type: string }> {
	check(signal);
	const answers = await abortable(
		lookup(url.hostname, { all: true }),
		signal,
	);
	if (
		!answers.length ||
		answers.some((answer) => !publicAddress(answer.address))
	)
		throw failure();
	check(signal);
	return new Promise((resolveResponse, reject) => {
		let done = false;
		const finish = (
			error?: Error,
			value?: { bytes: Buffer; type: string },
		) => {
			if (done) return;
			done = true;
			signal.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolveResponse(value!);
		};
		const req = request(
			url,
			{
				method: body ? "POST" : "GET",
				headers: body
					? {
							"Content-Type": "application/json",
							Authorization: `Bearer ${key}`,
						}
					: {},
				lookup: ((_hostname: unknown, options: any, cb: any) =>
					options?.all
						? cb(null, answers)
						: cb(
								null,
								answers[0].address,
								answers[0].family,
							)) as any,
			},
			(response) => {
				if (response.statusCode !== 200) {
					response.resume();
					finish(failure());
					return;
				}
				const type = (response.headers["content-type"] ?? "")
					.split(";")[0]
					.trim()
					.toLowerCase();
				if (
					body
						? type !== "application/json"
						: !["image/png", "image/jpeg"].includes(type)
				) {
					response.resume();
					finish(failure());
					return;
				}
				const parts: Buffer[] = [];
				let size = 0;
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > max) {
						finish(failure());
						req.destroy();
						return;
					}
					if (!done) parts.push(chunk);
				});
				response.once("end", () =>
					finish(undefined, { bytes: Buffer.concat(parts), type }),
				);
				response.once("error", () => finish(failure()));
				response.once("aborted", () => finish(failure()));
			},
		);
		const abort = () => {
			finish(cancelled());
			req.destroy();
		};
		signal.addEventListener("abort", abort, { once: true });
		req.once("error", () =>
			finish(signal.aborted ? cancelled() : failure()),
		);
		if (signal.aborted) {
			abort();
			return;
		}
		req.end(body);
	});
}
export async function generateLocalImage(options: {
	cliPath: string;
	prompt: string;
	outputDir: string;
	signal?: AbortSignal;
}): Promise<string> {
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (options.signal?.aborted) controller.abort();
	const timeout = setTimeout(() => controller.abort(), 150000);
	let config: ImageConfig | undefined;
	let saved: string | undefined;
	try {
		check(controller.signal);
		if (!options.prompt.trim()) throw failure();
		config = await configuration(options.cliPath, true, controller.signal);
		// Seedream 5.0 needs at least 2K; old shared CLI defaults can be 1024x1024.
		// Normalize this request only, leaving the user's CLI configuration intact.
		const pixels = /^(\d+)x(\d+)$/.exec(config.size);
		if (
			config.model.startsWith("doubao-seedream-5-0-") &&
			!config.model.includes("-pro-") &&
			pixels &&
			Number(pixels[1]) * Number(pixels[2]) < 3686400
		)
			config.size = "2K";
		const endpoint = safeUrl(
			config.base.href.replace(/\/$/, "") + "/images/generations",
		);
		const response = await retrieve(
			endpoint,
			controller.signal,
			1024 * 1024,
			JSON.stringify({
				model: config.model,
				prompt: options.prompt,
				size: config.size,
				output_format: "png",
				watermark: false,
			}),
			config.key,
		);
		config.key = "";
		const data = JSON.parse(response.bytes.toString("utf8"));
		if (typeof data?.data?.[0]?.url !== "string") throw failure();
		const image = await retrieve(
			safeUrl(data.data[0].url),
			controller.signal,
			20 * 1024 * 1024,
		);
		const png =
			image.bytes.length >= 24 &&
			image.bytes
				.subarray(0, 8)
				.equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
			image.bytes.subarray(12, 16).toString("ascii") === "IHDR";
		const jpeg =
			image.bytes.length >= 4 &&
			image.bytes[0] === 255 &&
			image.bytes[1] === 216 &&
			image.bytes[2] === 255 &&
			image.bytes[image.bytes.length - 2] === 255 &&
			image.bytes[image.bytes.length - 1] === 217;
		if (
			!(image.type === "image/png" && png) &&
			!(image.type === "image/jpeg" && jpeg)
		)
			throw failure();
		check(controller.signal);
		const directory = resolve(options.outputDir);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		check(controller.signal);
		saved = join(directory, `${randomUUID()}.${png ? "png" : "jpg"}`);
		await writeFile(saved, image.bytes, {
			flag: "wx",
			mode: 0o600,
			signal: controller.signal,
		});
		check(controller.signal);
		return saved;
	} catch {
		if (saved) await unlink(saved).catch(() => {});
		throw options.signal?.aborted ? cancelled() : failure();
	} finally {
		if (config) config.key = "";
		clearTimeout(timeout);
		options.signal?.removeEventListener("abort", onAbort);
	}
}
