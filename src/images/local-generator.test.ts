import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({
	execFile: vi.fn(),
	request: vi.fn(),
	lookup: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
import { generateLocalImage, imageReadiness } from "./local-generator";
let dir: string;
let config: Record<string, unknown>;
const png = Buffer.from(
	"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
	"hex",
);
let responses: { type: string; bytes: Buffer; status?: number }[];
beforeEach(async () => {
	vi.clearAllMocks();
	dir = await mkdtemp(join(tmpdir(), "local-image-test-"));
	config = {
		image_provider: "volcengine",
		image_api_base: "https://ark.cn-beijing.volces.com/api/v3",
		image_model: "model",
		image_size: "2K",
		image_api_key: "private-secret",
	};
	mocks.execFile.mockImplementation((_p, _a, _o, cb) => {
		cb(null, JSON.stringify({ success: true, data: { config } }), "");
		return {};
	});
	mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
	responses = [
		{
			type: "application/json",
			bytes: Buffer.from(
				JSON.stringify({
					data: [{ url: "https://images.example.com/generated.png" }],
				}),
			),
		},
		{ type: "image/png", bytes: png },
	];
	mocks.request.mockImplementation((_url, options, cb) => {
		const req = new EventEmitter() as any;
		req.destroy = (error: Error) => req.emit("error", error);
		req.end = () =>
			queueMicrotask(() => {
				const next = responses.shift()!;
				const response = new EventEmitter() as any;
				response.statusCode = next.status ?? 200;
				response.headers = { "content-type": next.type };
				response.resume = vi.fn();
				cb(response);
				response.emit("data", next.bytes);
				response.emit("end");
			});
		return req;
	});
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});
test("readiness checks existing configuration without network or secret request", async () => {
	expect((await imageReadiness("md2wechat")).available).toBe(true);
	expect(mocks.execFile.mock.calls[0][1]).not.toContain("--show-secret");
	expect(mocks.request).not.toHaveBeenCalled();
});
test("saves actual image locally and never forwards credentials to image download", async () => {
	const path = await generateLocalImage({
		cliPath: "md2wechat",
		prompt: "test",
		outputDir: dir,
	});
	expect(await readFile(path)).toEqual(png);
	expect(path.startsWith(dir)).toBe(true);
	expect(mocks.request.mock.calls[0][0].href).toBe(
		"https://ark.cn-beijing.volces.com/api/v3/images/generations",
	);
	expect(mocks.request.mock.calls[0][1].headers.Authorization).toBe(
		"Bearer private-secret",
	);
	expect(
		mocks.request.mock.calls[1][1].headers.Authorization,
	).toBeUndefined();
});
test.each([
	"https://api.weixin.qq.com",
	"http://ark.cn-beijing.volces.com",
	"https://wechat.com",
	"https://localhost",
])(
	"rejects unsafe provider address %s before any paid request",
	async (address) => {
		config.image_api_base = address;
		await expect(
			generateLocalImage({
				cliPath: "md2wechat",
				prompt: "test",
				outputDir: dir,
			}),
		).rejects.toThrow();
		expect(mocks.request).not.toHaveBeenCalled();
	},
);
test("rejects unsupported provider without a network call", async () => {
	config.image_provider = "openai";
	expect((await imageReadiness("md2wechat")).available).toBe(false);
	expect(mocks.request).not.toHaveBeenCalled();
});
test("does not echo server errors or secrets", async () => {
	responses[0] = {
		type: "application/json",
		bytes: Buffer.from(
			"private-secret https://secret.example/?token=hidden",
		),
		status: 401,
	};
	try {
		await generateLocalImage({
			cliPath: "md2wechat",
			prompt: "test",
			outputDir: dir,
		});
		throw new Error("unexpected success");
	} catch (error) {
		expect(String(error)).not.toMatch(
			/private-secret|secret.example|hidden|unexpected success/,
		);
	}
	expect(mocks.request).toHaveBeenCalledTimes(1);
});
test("rejects fake images even when content type claims png", async () => {
	responses[1].bytes = Buffer.from("<html>not an image</html>");
	await expect(
		generateLocalImage({
			cliPath: "md2wechat",
			prompt: "test",
			outputDir: dir,
		}),
	).rejects.toThrow();
});
test("cancelled operation never starts a request", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(
		generateLocalImage({
			cliPath: "md2wechat",
			prompt: "test",
			outputDir: dir,
			signal: controller.signal,
		}),
	).rejects.toThrow("取消");
	expect(mocks.request).not.toHaveBeenCalled();
});
test("rejects private DNS addresses and never downloads them", async () => {
	mocks.lookup
		.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
		.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
	await expect(
		generateLocalImage({
			cliPath: "md2wechat",
			prompt: "test",
			outputDir: dir,
		}),
	).rejects.toThrow();
	expect(mocks.request).toHaveBeenCalledTimes(1);
});
test("rejects oversized images without saving", async () => {
	responses[1].bytes = Buffer.alloc(20 * 1024 * 1024 + 1);
	await expect(
		generateLocalImage({
			cliPath: "md2wechat",
			prompt: "test",
			outputDir: dir,
		}),
	).rejects.toThrow();
});
test("cancels an in-flight generation without retrying", async () => {
	const controller = new AbortController();
	mocks.request.mockImplementation(() => {
		const req = new EventEmitter() as any;
		req.destroy = vi.fn();
		req.end = () => queueMicrotask(() => controller.abort());
		return req;
	});
	await expect(
		generateLocalImage({
			cliPath: "md2wechat",
			prompt: "test",
			outputDir: dir,
			signal: controller.signal,
		}),
	).rejects.toThrow("取消");
	expect(mocks.request).toHaveBeenCalledTimes(1);
});
test("refuses redirect responses instead of forwarding authorization", async () => {
	responses[0].status = 302;
	await expect(
		generateLocalImage({
			cliPath: "md2wechat",
			prompt: "test",
			outputDir: dir,
		}),
	).rejects.toThrow();
	expect(mocks.request).toHaveBeenCalledTimes(1);
});
test("reports only generic failure when configuration process leaks an error", async () => {
	mocks.execFile.mockImplementation((_p, _a, _o, cb) =>
		cb(new Error("private-secret"), "", "private-secret"),
	);
	const result = await imageReadiness("md2wechat");
	expect(result.available).toBe(false);
	expect(result.message).not.toContain("private-secret");
});

test("uses documented 2K for undersized legacy configuration without editing config", async () => {
	config.image_size = "1024x1024";
	config.image_model = "doubao-seedream-5-0-260128";
	let sent = "";
	const original = mocks.request.getMockImplementation()!;
	mocks.request.mockImplementation((...args: any[]) => {
		const req = original(...args);
		const end = req.end;
		req.end = (body: string) => {
			if (body) sent = body;
			end(body);
		};
		return req;
	});
	await generateLocalImage({
		cliPath: "md2wechat",
		prompt: "test",
		outputDir: dir,
	});
	expect(JSON.parse(sent).size).toBe("2K");
	expect(config.image_size).toBe("1024x1024");
});
