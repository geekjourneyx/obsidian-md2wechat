import { expect, it } from "vitest";
import { publicAddress, downloadImage } from "./remote-image";
it("does not let a referenced image fetch private network data", async () => {
	for (const ip of [
		"127.0.0.1",
		"10.0.0.1",
		"192.168.1.1",
		"172.16.0.1",
		"169.254.169.254",
		"::1",
		"fc00::1",
		"::ffff:127.0.0.1",
	])
		expect(publicAddress(ip)).toBe(false);
	expect(publicAddress("8.8.8.8")).toBe(true);
	await expect(
		downloadImage("file:///etc/hosts", "/unused"),
	).rejects.toThrow();
	await expect(
		downloadImage("https://user:pass@example.com/a.png", "/unused"),
	).rejects.toThrow();
});
