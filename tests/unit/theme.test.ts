import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/color";
import { DEFAULT_THEME, readableOn, resolveTheme, THEME_PRESETS, themeVars, themeWarnings } from "@/lib/theme";

const AA = 4.5;

describe("paleta de la tienda", () => {
  it("completa valores faltantes o inválidos con los de por defecto", () => {
    expect(resolveTheme(null)).toEqual(DEFAULT_THEME);
    expect(resolveTheme({ background: "rojo", text: "#112233", bar: "" })).toEqual({ ...DEFAULT_THEME, text: "#112233" });
  });

  it("todas las combinaciones listas dejan los textos legibles (AA)", () => {
    for (const preset of THEME_PRESETS) {
      const v = themeVars("#7B2F9E", preset.colors);
      for (const bg of [v["--store-bg"], v["--store-card"], v["--store-soft"]]) {
        expect(contrastRatio(v["--store-ink"], bg), `${preset.name} texto`).toBeGreaterThanOrEqual(AA);
        expect(contrastRatio(v["--store-muted"], bg), `${preset.name} texto suave`).toBeGreaterThanOrEqual(AA);
        expect(contrastRatio(v["--brand-fg"], bg), `${preset.name} precios`).toBeGreaterThanOrEqual(AA);
      }
      expect(contrastRatio(v["--on-bar"], v["--bar"])).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(v["--on-accent"], v["--accent"])).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(v["--on-store-ink"], v["--store-ink"])).toBeGreaterThanOrEqual(AA);
    }
  });

  it("si el dueño elige un texto que no se lee, se ajusta y se le avisa", () => {
    const bad = { ...DEFAULT_THEME, text: "#F0E0D0" };
    expect(themeWarnings(bad).length).toBe(1);
    const v = themeVars("#7B2F9E", bad);
    expect(contrastRatio(v["--store-ink"], bad.surface)).toBeGreaterThanOrEqual(AA);
    expect(themeWarnings(DEFAULT_THEME)).toEqual([]);
  });

  it("deja igual un color que ya se lee", () => {
    expect(readableOn("#1F2937", ["#FFFFFF"])).toBe("#1F2937");
  });

  it("la barra y las etiquetas usan el color principal si no se eligen", () => {
    const v = themeVars("#2255AA", { ...DEFAULT_THEME, bar: null, accent: null });
    expect(v["--bar"]).toBe("#2255AA");
    expect(v["--accent"]).toBe("#2255AA");
  });
});
