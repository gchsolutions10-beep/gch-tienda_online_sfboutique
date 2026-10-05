import { describe, expect, it } from "vitest";
import { autoExcerpt, bannerLive, caracasDateTime, caracasDay, isSafeLink, parseTags, postState, readingMinutes, toCaracasInput } from "@/lib/blog";

const now = new Date("2026-10-05T15:00:00Z");

describe("estado del artículo", () => {
  it("borrador, programado o publicado según la fecha", () => {
    expect(postState("DRAFT", now, now)).toBe("draft");
    expect(postState("PUBLISHED", null, now)).toBe("draft");
    expect(postState("PUBLISHED", new Date("2026-10-06T13:00:00Z"), now)).toBe("scheduled");
    expect(postState("PUBLISHED", new Date("2026-10-01T13:00:00Z"), now)).toBe("published");
  });
});

describe("texto del artículo", () => {
  it("calcula los minutos de lectura (mínimo 1) sin contar las fotos", () => {
    expect(readingMinutes("Hola")).toBe(1);
    expect(readingMinutes(Array(600).fill("palabra").join(" "))).toBe(3);
    expect(readingMinutes("![una foto con muchas palabras](/marca/blog-abc)")).toBe(1);
  });

  it("toma el primer párrafo como resumen, sin Markdown ni títulos", () => {
    const md = "## Título\n\n![foto](/marca/blog-x)\n\nEl **jean mom** es [la prenda](/catalogo) más versátil.\n\nOtro párrafo.";
    expect(autoExcerpt(md)).toBe("El jean mom es la prenda más versátil.");
    const long = autoExcerpt(Array(80).fill("palabra").join(" "), 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("…")).toBe(true);
  });

  it("limpia las etiquetas", () => {
    expect(parseTags("Jeans, #outfits, jeans, , Tendencias")).toEqual(["jeans", "outfits", "tendencias"]);
  });
});

describe("enlaces y fechas de la portada", () => {
  it("solo acepta rutas de la tienda o https", () => {
    expect(isSafeLink("/catalogo?categoria=vestidos")).toBe(true);
    expect(isSafeLink("https://instagram.com/sf_boutiqueve")).toBe(true);
    expect(isSafeLink("//evil.com")).toBe(false);
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("http://inseguro.com")).toBe(false);
  });

  it("un banner se ve solo activo y entre sus fechas (días completos en Caracas)", () => {
    const startsAt = caracasDay("2026-10-05")!;
    const endsAt = caracasDay("2026-10-05", true)!;
    expect(startsAt.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-10-06T03:59:59.000Z");
    expect(bannerLive({ isActive: true, startsAt, endsAt }, now)).toBe(true);
    expect(bannerLive({ isActive: false, startsAt, endsAt }, now)).toBe(false);
    expect(bannerLive({ isActive: true, startsAt, endsAt }, new Date("2026-10-06T05:00:00Z"))).toBe(false);
    expect(caracasDay("2026-02-30")).toBeNull();
  });

  it("convierte la hora de Venezuela de ida y vuelta", () => {
    const d = caracasDateTime("2026-10-06T09:30")!;
    expect(d.toISOString()).toBe("2026-10-06T13:30:00.000Z");
    expect(toCaracasInput(d)).toBe("2026-10-06T09:30");
    expect(caracasDateTime("mañana")).toBeNull();
  });
});
