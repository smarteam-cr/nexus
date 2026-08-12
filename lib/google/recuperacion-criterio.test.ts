import { describe, it, expect } from "vitest";
import { bucketDe, datosDeReset, type FilaCandidata } from "./recuperacion-criterio";

/**
 * lib/google/recuperacion-criterio.test.ts — QUÉ SE RESCATA, COMO TABLA.
 * Cada caso está anclado a una familia REAL medida el 2026-08-08 (corridas quemadas del
 * 17-may y 7-jul, las 487 selladas antes de ocurrir, las 66 basura, la sala sin leer).
 */

const AHORA = new Date("2026-08-08T15:00:00Z");
const AYER = new Date("2026-08-07T10:00:00Z");
const MANANA = new Date("2026-08-09T10:00:00Z");

const INTERNO = "asalas@smarteamcr.com";
const CLIENTE = "gerente@wherex.cl";

function fila(over: Partial<FilaCandidata>): FilaCandidata {
  return {
    enrichedAt: new Date("2026-07-07T12:00:00Z"),
    transcript: null,
    googleDocId: null,
    organizerEmail: INTERNO,
    participants: [],
    date: AYER,
    ...over,
  };
}

describe("bucketDe — la tabla", () => {
  it("la corrida quemada del 17-may (sellada, sin transcript, CON doc) → A", () => {
    expect(bucketDe(fila({ googleDocId: "doc-1" }), AHORA)).toBe("A_sellada_con_doc");
  });

  it("sellada sin doc con organizador CLIENTE pero un interno invitado → B (lo que R3 destraba)", () => {
    expect(
      bucketDe(fila({ organizerEmail: CLIENTE, participants: [CLIENTE, INTERNO] }), AHORA),
    ).toBe("B_sin_doc");
  });

  it("sellada ANTES de ocurrir (las 487 de INV16a) → B aunque no haya interno", () => {
    /* Se resetea para que el pipeline la procese A SU HORA — dejarla sellada es dejar
       INV16(a) rojo para siempre. */
    expect(
      bucketDe(fila({ date: MANANA, organizerEmail: CLIENTE, participants: [CLIENTE] }), AHORA),
    ).toBe("B_sin_doc");
  });

  it("pasada, sin doc y 100% externa → NO se rescata (ilegible por diseño)", () => {
    /* Resetearla solo compraría 5 intentos de churn con el mismo final. */
    expect(
      bucketDe(fila({ organizerEmail: CLIENTE, participants: [CLIENTE, "otro@wherex.cl"] }), AHORA),
    ).toBeNull();
  });

  it("LA guarda del churn: pasada con organizador NUESTRO y sin doc → NO se re-busca", () => {
    /* El pipeline viejo YA la buscó bien en Drive (el organizador era impersonable) y no
       había nada. El primer dry-run metía 3.620 de éstas en B — se cazó con los conteos.
       La edición que la pone en rojo: volver B a «cualquiera con impersonable». */
    expect(bucketDe(fila({ organizerEmail: INTERNO, participants: [INTERNO] }), AHORA)).toBeNull();
  });

  it("transcript basura de 120 chars → C, aunque tenga doc y esté sellada", () => {
    expect(bucketDe(fila({ transcript: "x".repeat(120), googleDocId: "doc-1" }), AHORA)).toBe(
      "C_transcript_basura",
    );
  });

  it("LA guarda de idempotencia: una fila ya reseteada no cae en ningún bucket", () => {
    /* Correr el script dos veces no puede hacer nada la segunda. La edición que la pone en
       rojo: sacar el `if (f.enrichedAt === null) return null`. */
    expect(bucketDe(fila({ enrichedAt: null }), AHORA)).toBeNull();
    expect(bucketDe(fila({ enrichedAt: null, googleDocId: "doc-1" }), AHORA)).toBeNull();
  });

  it("LA guarda del contenido sano: un transcript de 5k chars JAMÁS se toca", () => {
    expect(bucketDe(fila({ transcript: "x".repeat(5000), googleDocId: "doc-1" }), AHORA)).toBeNull();
  });
});

describe("datosDeReset", () => {
  it("A y B resetean sin tocar transcript; C además lo limpia", () => {
    expect(datosDeReset("A_sellada_con_doc")).toEqual({
      enrichedAt: null,
      enrichAttempts: 0,
      enrichError: null,
    });
    expect(datosDeReset("B_sin_doc")).toEqual({
      enrichedAt: null,
      enrichAttempts: 0,
      enrichError: null,
    });
    expect(datosDeReset("C_transcript_basura")).toEqual({
      enrichedAt: null,
      enrichAttempts: 0,
      enrichError: null,
      transcript: null,
    });
  });

  it("LA guarda del summary: ningún reset nombra summary ni minutas", () => {
    /* El rescate repone la OPORTUNIDAD de leer; nunca borra trabajo existente. */
    for (const b of ["A_sellada_con_doc", "B_sin_doc", "C_transcript_basura"] as const) {
      expect(Object.keys(datosDeReset(b))).not.toContain("summary");
    }
  });
});
