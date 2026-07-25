/**
 * lib/clients/kind.test.ts — la fuente única de "qué ES una empresa" + el TAM.
 *
 * Lo que congela: que `CS_CLIENT_WHERE` siga siendo SOLO la cartera (si un día alguien
 * le agrega ALIADO "para que aparezcan también", los listados de CS y de cobranza se
 * llenan de empresas que no facturan), y que el TAM no acepte basura desde HTTP.
 */
import { describe, it, expect } from "vitest";
import {
  CLIENT_KINDS,
  CLIENT_KIND_META,
  CS_CLIENT_WHERE,
  TAM_MAX_USD,
  esClienteDeCartera,
  formatTamUsd,
  parseClientKind,
  parseTamUsd,
} from "./kind";

describe("ClientKind", () => {
  it("la cartera de CS es exactamente CLIENTE", () => {
    expect(CS_CLIENT_WHERE).toEqual({ kind: "CLIENTE" });
    for (const k of CLIENT_KINDS) {
      expect(esClienteDeCartera(k)).toBe(k === "CLIENTE");
    }
  });

  it("toda categoría tiene label, plural y ayuda", () => {
    for (const k of CLIENT_KINDS) {
      const meta = CLIENT_KIND_META[k];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.plural.length).toBeGreaterThan(0);
      expect(meta.help.length).toBeGreaterThan(0);
    }
  });

  it("parseClientKind acepta lo válido y rechaza el resto", () => {
    expect(parseClientKind("ALIADO")).toBe("ALIADO");
    expect(parseClientKind("aliado")).toBeNull(); // el enum es en mayúsculas
    expect(parseClientKind("EX_CLIENTE")).toBeNull();
    expect(parseClientKind(undefined)).toBeNull();
    expect(parseClientKind(3)).toBeNull();
  });
});

describe("TAM", () => {
  it("null y cadena vacía son «sin estimar», NO cero", () => {
    expect(parseTamUsd(null)).toEqual({ ok: true, value: null });
    expect(parseTamUsd("")).toEqual({ ok: true, value: null });
    // El cero explícito SÍ se guarda: es una decisión de Ventas, no un vacío.
    expect(parseTamUsd(0)).toEqual({ ok: true, value: 0 });
  });

  it("acepta números y strings con separadores, redondeando a 2 decimales", () => {
    expect(parseTamUsd(12000)).toEqual({ ok: true, value: 12000 });
    expect(parseTamUsd("36,000")).toEqual({ ok: true, value: 36000 });
    expect(parseTamUsd("1 250.555")).toEqual({ ok: true, value: 1250.56 });
  });

  it("rechaza basura, negativos y el dedazo de ceros", () => {
    expect(parseTamUsd("mucho").ok).toBe(false);
    expect(parseTamUsd(-1).ok).toBe(false);
    expect(parseTamUsd(TAM_MAX_USD + 1).ok).toBe(false);
    expect(parseTamUsd(TAM_MAX_USD).ok).toBe(true); // el borde entra
  });

  it("formatTamUsd distingue «sin estimar» de cero", () => {
    expect(formatTamUsd(null)).toBe("—");
    expect(formatTamUsd(undefined)).toBe("—");
    expect(formatTamUsd(0)).toBe("$0");
    expect(formatTamUsd(36000)).toBe("$36,000");
  });
});
