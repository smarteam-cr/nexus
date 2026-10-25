/**
 * lib/sessions/motivo-sin-texto.test.ts — el motivo de cada reunión sin texto (T4): qué se guarda, qué se muestra y a
 * quién se le dice cómo evitarlo.
 */
import { describe, expect, it } from "vitest";
import { DE_QUIEN_ES, type MotivoDeLaFalta } from "@/lib/google/por-que-falta";
import { COMO_EVITARLO, MOTIVOS_DE_ESPERA, cambiosDeMotivo, leerMotivoGuardado, motivoEnLaReunion, motivoParaMostrar, motivoQueLeToca, type FilaParaElMotivo } from "./motivo-sin-texto";

const INICIO = new Date("2026-10-20T15:00:00Z");
const HOY = new Date("2026-10-25T15:00:00Z");

const fila = (p: Partial<FilaParaElMotivo> = {}): FilaParaElMotivo => ({
  id: "s1",
  date: INICIO,
  duration: 60,
  organizerEmail: "liz@smarteamcr.com",
  participants: ["liz@smarteamcr.com", "ana@cliente.com"],
  enrichedAt: new Date(+INICIO + 3 * 3_600_000),
  enrichAttempts: 0,
  enrichError: null,
  googleDocId: null,
  canceladaEn: null,
  clase: "nada",
  aMano: false,
  tieneNotas: false,
  motivoSinTexto: null,
  ...p,
});

describe("el motivo guardado", () => {
  it("solo se acepta un motivo que Nexus conoce", () => {
    expect(leerMotivoGuardado("no_se_grabo")).toBe("no_se_grabo");
    expect(leerMotivoGuardado("motivo_viejo")).toBeNull();
    expect(leerMotivoGuardado("toString")).toBeNull();
    expect(leerMotivoGuardado(null)).toBeNull();
  });
  it("se muestra el guardado; sin él, el de ahora", () => {
    const r = { date: INICIO, duration: 60, enrichedAt: fila().enrichedAt, enrichAttempts: 0, enrichError: null, googleDocId: null, organizerEmail: "liz@smarteamcr.com", participants: ["liz@smarteamcr.com"], tieneNotas: false };
    expect(motivoParaMostrar("documento_vacio", r, HOY)).toBe("documento_vacio");
    expect(motivoParaMostrar(null, r, HOY)).toBe("no_se_grabo");
  });
  it("todo motivo tiene su «cómo evitarlo» declarado (aunque sea null)", () => {
    for (const m of Object.keys(DE_QUIEN_ES) as MotivoDeLaFalta[]) expect(m in COMO_EVITARLO).toBe(true);
  });
});

describe("en la reunión", () => {
  it("una que está esperando no muestra el bloque (eso lo dice el aviso de espera)", () => {
    for (const m of MOTIVOS_DE_ESPERA) expect(motivoEnLaReunion(m, true)).toBeNull();
  });
  it("cómo evitarlo, solo para quien la organizó o estuvo", () => {
    expect(motivoEnLaReunion("no_se_grabo", true)?.comoEvitarlo).toMatch(/Tomar notas con Gemini/);
    expect(motivoEnLaReunion("no_se_grabo", false)?.comoEvitarlo).toBeNull();
    expect(motivoEnLaReunion("cancelada", true)).toMatchObject({ dueno: "nada", comoEvitarlo: null });
  });
});

describe("lo que escribe el job", () => {
  it("la que no tiene texto recibe su motivo; la que lo tiene, ninguno", () => {
    expect(motivoQueLeToca(fila(), HOY)).toBe("no_se_grabo");
    expect(motivoQueLeToca(fila({ clase: "transcripcion" }), HOY)).toBeNull();
    expect(motivoQueLeToca(fila({ clase: "solo_notas" }), HOY)).toBeNull();
    // Lo que contó una persona (la marca aMano) es texto aunque sea corto.
    expect(motivoQueLeToca(fila({ aMano: true }), HOY)).toBeNull();
    expect(motivoQueLeToca(fila({ canceladaEn: INICIO }), HOY)).toBe("cancelada");
  });
  it("solo escribe lo que cambió, agrupado por motivo, y borra el de las que ya tienen texto", () => {
    const c = cambiosDeMotivo(
      [
        fila({ id: "igual", motivoSinTexto: "no_se_grabo" }),
        fila({ id: "nueva" }),
        fila({ id: "cambio", motivoSinTexto: "esperando_a_google" }),
        fila({ id: "ya-tiene", clase: "transcripcion", motivoSinTexto: "no_se_grabo" }),
        fila({ id: "con-texto-sin-motivo", clase: "transcripcion" }),
      ],
      HOY,
    );
    expect(c.get("no_se_grabo")?.sort()).toEqual(["cambio", "nueva"]);
    expect(c.get(null)).toEqual(["ya-tiene"]);
    expect([...c.values()].flat()).not.toContain("igual");
    expect([...c.values()].flat()).not.toContain("con-texto-sin-motivo");
  });
});
