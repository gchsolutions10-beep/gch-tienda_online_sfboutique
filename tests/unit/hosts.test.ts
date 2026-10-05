import { describe, expect, it } from "vitest";
import { domainPair, parseCustomDomain, parseHost } from "@/lib/hosts";

describe("dominio propio", () => {
  it("limpia lo que escribe la dueña", () => {
    expect(parseCustomDomain("https://www.SFBoutique.com/tienda?x=1")).toBe("www.sfboutique.com");
    expect(parseCustomDomain("sfboutique.com.ve")).toBe("sfboutique.com.ve");
  });

  it("rechaza dominios inválidos o de la plataforma", () => {
    expect(parseCustomDomain("sf boutique")).toBeNull();
    expect(parseCustomDomain("localhost")).toBeNull();
    expect(parseCustomDomain("192.168.0.1")).toBeNull();
    expect(parseCustomDomain("sfboutique.vercel.app")).toBeNull();
    expect(parseCustomDomain("tienda.gchmoda.com", "gchmoda.com")).toBeNull();
  });

  it("registra el dominio con y sin www", () => {
    expect(domainPair("sfboutique.com")).toEqual(["sfboutique.com", "www.sfboutique.com"]);
    expect(domainPair("www.sfboutique.com")).toEqual(["sfboutique.com", "www.sfboutique.com"]);
  });

  it("un dominio propio se resuelve como tal", () => {
    expect(parseHost("www.sfboutique.com", "sfboutique.vercel.app")).toEqual({ kind: "custom", domain: "www.sfboutique.com" });
  });
});
