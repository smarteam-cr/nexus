import { describe, it, expect } from "vitest";
import { bucketDe, datosDeReset, diasDelRescate, entraEnElRecorte, type FilaCandidata } from "./recuperacion-criterio";

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

describe("bucket D — selladas vacías antes de que terminara la reunión (2026-10-17)", () => {
  const INICIO = new Date("2026-10-10T15:00:00Z");
  const HOY = new Date("2026-10-17T15:00:00Z");

  it("sin doc, organizador nuestro, sellada una hora después del inicio de una reunión de 90 minutos → D", () => {
    const f = fila({ date: INICIO, duration: 90, enrichedAt: new Date(INICIO.getTime() + 61 * 60_000) });
    expect(bucketDe(f, HOY)).toBe("D_sellada_antes_de_terminar");
  });

  it("sellada después del fin más 20 minutos → nada que rescatar (se buscó a tiempo)", () => {
    const f = fila({ date: INICIO, duration: 30, enrichedAt: new Date(INICIO.getTime() + 61 * 60_000) });
    expect(bucketDe(f, HOY)).toBeNull();
  });

  it("sin duración no se puede saber cuándo terminó → no entra a D", () => {
    expect(bucketDe(fila({ date: INICIO, enrichedAt: new Date(INICIO.getTime() + 61 * 60_000) }), HOY)).toBeNull();
  });

  it("con doc: sellada antes de terminar es D, después es A; con transcripción sana no se rescata", () => {
    expect(bucketDe(fila({ date: INICIO, duration: 90, googleDocId: "d", enrichedAt: new Date(INICIO.getTime() + 61 * 60_000) }), HOY)).toBe("D_sellada_antes_de_terminar");
    expect(bucketDe(fila({ date: INICIO, duration: 30, googleDocId: "d", enrichedAt: new Date(INICIO.getTime() + 61 * 60_000) }), HOY)).toBe("A_sellada_con_doc");
    expect(bucketDe(fila({ date: INICIO, duration: 90, transcript: "x".repeat(500), enrichedAt: new Date(INICIO.getTime() + 61 * 60_000) }), HOY)).toBeNull();
  });
});

describe("U1: los recortes del rescate de las 177", () => {
  it("diasDelRescate: sin el flag, toda la historia; «90» y «=90» valen; mal escrito es un error, no «toda la historia»", () => {
    /* La edición que la pone en rojo: volver a ignorar un --dias mal escrito (rescataba 950 en vez de 177). */
    expect(diasDelRescate(["--apply"])).toEqual({ dias: null });
    expect(diasDelRescate(["--dias", "90"])).toEqual({ dias: 90 });
    expect(diasDelRescate(["--dias=90"])).toEqual({ dias: 90 });
    for (const malo of [["--dias", "noventa"], ["--dias"], ["--dias", "0"], ["--dias", "-3"], ["--dias=9.5"], ["--dias", "--apply"]]) {
      expect(diasDelRescate(malo), malo.join(" ")).toHaveProperty("error");
    }
  });

  it("entraEnElRecorte: solo clientes y prospectos por la dueña; solo futuras por la fecha", () => {
    const ahora = new Date("2026-10-25T15:00:00Z");
    const ayer = new Date("2026-10-24T15:00:00Z");
    const deEmpresa = new Set(["cli_acme"]);
    const r = { soloFuturas: false, soloClientesYProspectos: true, deEmpresa };
    expect(entraEnElRecorte({ date: ayer, duena: "cli_acme" }, ahora, r)).toBe(true);
    expect(entraEnElRecorte({ date: ayer, duena: "cli_interno" }, ahora, r)).toBe(false);
    expect(entraEnElRecorte({ date: ayer, duena: null }, ahora, r)).toBe(false);
    expect(entraEnElRecorte({ date: ayer, duena: null }, ahora, { ...r, soloClientesYProspectos: false })).toBe(true);
    expect(entraEnElRecorte({ date: ayer, duena: "cli_acme" }, ahora, { ...r, soloFuturas: true })).toBe(false);
  });
});
