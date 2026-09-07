import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ScreenBreakpoints,
  StyleBorderRadius,
  StyleColors,
  StyleSpacing,
} from "./styleConstants";

describe("style constants", () => {
  it("keeps the agreed responsive and spacing scale", () => {
    expect(ScreenBreakpoints).toEqual({
      sm: "480px",
      md: "768px",
      lg: "1200px",
      xl: "1440px",
      "2xl": "1920px",
    });
    expect(StyleSpacing).toMatchObject({ xxs: "2px", md: "16px", "3xl": "64px" });
  });

  it("exposes glass surfaces and rounded panel tokens", () => {
    expect(StyleColors.surfaceGlass).toBe("var(--surface-glass)");
    expect(StyleColors.canvas).toBe("var(--canvas)");
    expect(StyleBorderRadius).toMatchObject({ card: "20px", panel: "24px", pill: "9999px" });
  });

  it("keeps every agreed color family and its contrast colors", () => {
    for (const name of ["red", "orange", "yellow", "green", "teal", "cyan", "blue", "purple", "violet"]) {
      const title = `${name[0].toUpperCase()}${name.slice(1)}`;
      expect(StyleColors[name]).toBe(`var(--${name})`);
      expect(StyleColors[`on${title}`]).toBe(`var(--on-${name})`);
      expect(StyleColors[`${name}UltraHigh`]).toBe(`var(--${name}-ultra-high)`);
      expect(StyleColors[`on${title}UltraHigh`]).toBe(`var(--on-${name}-ultra-high)`);
    }
  });

  it("uses a pastel palette for translucent surfaces and change indicators", () => {
    const theme = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

    expect(theme).toContain("--canvas: #f6f1f7;");
    expect(theme).toContain("--primary: #a46f90;");
    expect(theme).toContain("--surface-glass-fallback: #fbf7fb;");
    expect(theme).toContain("--change-increase: #6c8f82;");
    expect(theme).toContain("--change-decrease: #b77d8f;");
    expect(theme).not.toContain("--primary: #0f766e;");
  });
});
