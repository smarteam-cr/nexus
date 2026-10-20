import { describe, expect, it } from "vitest";
import { AVISOS_DEL_ENCARGADO, destinatarios, enlaceDeLaCuenta, esBuenaNoticia, esRutaInterna, textoDeAviso, TIPOS_DE_AVISO } from "./avisos";

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

describe("los avisos que se mudan con el pase de cuenta (2026-10-19)", () => {
  it("son del encargado: la adopción y el documento aprobado; nunca un mensaje", () => {
    for (const t of AVISOS_DEL_ENCARGADO) expect(TIPOS_DE_AVISO).toHaveProperty(t);
    expect(AVISOS_DEL_ENCARGADO).not.toContain("proyecto.encargado");
  });
  it("⛔ invariante 1: el enlace es de ESA cuenta, no de otra cuyo id empiece igual", () => {
    expect(enlaceDeLaCuenta("/clients/abc", "abc")).toBe(true);
    expect(enlaceDeLaCuenta("/clients/abc?tab=p1&canvas=x", "abc")).toBe(true);
    expect(enlaceDeLaCuenta("/customer-success/abc?pestana=adopcion", "abc")).toBe(true);
    expect(enlaceDeLaCuenta("/clients/abcd", "abc")).toBe(false);
    expect(enlaceDeLaCuenta("/clients/abcd?tab=x", "abc")).toBe(false);
    expect(enlaceDeLaCuenta("/para-ti", "abc")).toBe(false);
  });
});
