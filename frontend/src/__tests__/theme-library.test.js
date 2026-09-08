import { describe, expect, it } from "vitest";
import {
  applySkinTokens,
  BUILTIN_SKINS,
  themeDocument,
  validateSkin,
} from "../lib/skins";

describe("portable color themes", () => {
  it("built-in themes meet readable contrast and round-trip as portable JSON", () => {
    for (const skin of BUILTIN_SKINS)
      expect(
        validateSkin(JSON.parse(JSON.stringify(themeDocument(skin)))),
      ).toEqual(themeDocument(skin));
  });
  it("rejects injected code, extra palette fields, and unreadable text", () => {
    const document = themeDocument(BUILTIN_SKINS[0]);
    expect(() =>
      validateSkin({ ...document, css: "body{display:none}" }),
    ).toThrow();
    expect(() =>
      validateSkin({
        ...document,
        light: { ...document.light, accent: "url(https://example.com)" },
      }),
    ).toThrow();
    expect(() =>
      validateSkin({
        ...document,
        light: { ...document.light, text: "#FFFFFF" },
      }),
    ).toThrow(/contrast/);
  });
  it("switches the full palette for dark mode without storing executable content", () => {
    const root = document.createElement("div");
    applySkinTokens(root, BUILTIN_SKINS[0], "light");
    expect(root.style.getPropertyValue("--studio-canvas")).toBe("246 247 248");
    applySkinTokens(root, BUILTIN_SKINS[0], "dark");
    expect(root.style.getPropertyValue("--studio-canvas")).toBe("23 26 32");
    expect(root.style.getPropertyValue("--studio-brand-contrast")).toBe(
      "255 255 255",
    );
  });
});
