import { describe, expect, it } from "vitest";
import { destinatarios, esBuenaNoticia, esRutaInterna, textoDeAviso, TIPOS_DE_AVISO } from "./avisos";

describe("destinatarios de un aviso", () => {
  it("⭐ nunca le llega a quien hizo la acción", () => {
    expect(destinatarios(["ana@smarteamcr.com"], [], "ANA@smarteamcr.com")).toEqual([]);
    expect(destinatarios(["ana@smarteamcr.com"], ["beto@smarteamcr.com", "ana@smarteamcr.com"], "beto@smarteamcr.com")).toEqual([
      "ana@smarteamcr.com",
    ]);
  });

  it("sin repetir, en minúsculas, y sin lo que no es un correo", () => {
    expect(destinatarios(["Ana@Smarteamcr.com", null, "", "sin-arroba"], ["ana@smarteamcr.com"], null)).toEqual([
      "ana@smarteamcr.com",
    ]);
  });
});

describe("el enlace de un aviso es una ruta de Nexus", () => {
  it.each([
    ["/clients/abc?tab=x", true],
    ["/para-ti", true],
    ["//evil.com", false],
    ["https://evil.com", false],
    ["clients", false],
    ["/a\r\nb", false],
  ])("%s → %s", (href, ok) => {
    expect(esRutaInterna(href)).toBe(ok);
  });
});

describe("textos", () => {
  it("sin saltos y con tope", () => {
    expect(textoDeAviso("  hola\n  mundo ")).toBe("hola mundo");
    expect(textoDeAviso("x".repeat(300), 10)).toHaveLength(10);
  });

  it("las buenas noticias llevan ✓", () => {
    expect(esBuenaNoticia("cliente.aprobo-propuesta")).toBe(true);
    expect(esBuenaNoticia("finanzas.devuelto")).toBe(false);
    expect(esBuenaNoticia("no.existe")).toBe(false);
  });

  it("los tipos tienen la forma <módulo>.<qué pasó>", () => {
    for (const t of Object.keys(TIPOS_DE_AVISO)) expect(t).toMatch(/^[a-z]+\.[a-z-]+$/);
  });
});
