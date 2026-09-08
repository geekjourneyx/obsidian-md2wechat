import { locateCli } from "./catalog-service";
import { expect, it } from "vitest";
import { CatalogService } from "./catalog-service";
import { createCliRunner } from "./runner";
it("discovers the installed CLI without requiring obsolete stdin support or a fixed module count", async () => {
	const c = await new CatalogService(
		createCliRunner(await locateCli(process.env.MD2WECHAT_TEST_CLI)),
	).load();
	expect(c.themes.length).toBeGreaterThan(0);
	expect(c.defaultTheme).toBe("default");
	expect(c.commands).toContain("preview");
});
