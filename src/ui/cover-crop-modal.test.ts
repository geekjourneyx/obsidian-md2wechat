import { expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ Modal: class {}, Setting: class {} }));
import { cropRectangle } from "./cover-crop-modal";
it("crops landscape, portrait and square without stretching", () => {
	expect(cropRectangle(1000, 500, 1)).toEqual({
		x: 250,
		y: 0,
		width: 500,
		height: 500,
	});
	expect(cropRectangle(500, 1000, 1)).toEqual({
		x: 0,
		y: 250,
		width: 500,
		height: 500,
	});
	expect(cropRectangle(500, 500, 1)).toEqual({
		x: 0,
		y: 0,
		width: 500,
		height: 500,
	});
	const wide = cropRectangle(500, 1000, 2.35);
	expect(wide.width / wide.height).toBeCloseTo(2.35);
	expect(wide.y).toBeGreaterThan(0);
});
it("keeps focal offsets within image bounds", () => {
	expect(cropRectangle(1000, 500, 1, -2, 0).x).toBe(0);
	expect(cropRectangle(1000, 500, 1, 2, 0).x).toBe(500);
	expect(cropRectangle(500, 1000, 1, 0, 1).y).toBe(500);
	for (const dimensions of [
		[2000, 100],
		[100, 2000],
		[100, 100],
	])
		for (const ratio of [1, 2.35])
			for (const offset of [0, 0.5, 1]) {
				const r = cropRectangle(
					dimensions[0]!,
					dimensions[1]!,
					ratio,
					offset,
					offset,
				);
				expect(r.x + r.width).toBeLessThanOrEqual(dimensions[0]!);
				expect(r.y + r.height).toBeLessThanOrEqual(dimensions[1]!);
			}
});
it("rejects invalid dimensions", () => {
	for (const value of [0, -1, NaN, Infinity])
		expect(() => cropRectangle(value, 500, 1)).toThrow();
});
