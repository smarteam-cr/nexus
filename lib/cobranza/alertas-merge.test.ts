/**
 * lib/cobranza/alertas-merge.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/alertas-merge.test.ts --project unit`.
 *
 * Una fila por cobro, que sube (decisión 5 de Alex, 2026-09-12: si la fecha prometida pasa sin
 * depósito, la alerta sube). Y el «Posponer» manual sigue funcionando: el corte no despierta lo que
 * alguien pospuso mientras la situación del cobro sea la misma.
 */
import { describe, it, expect } from "vitest";
import type { AlertaDraft } from "./engine";
import { resolverMergeAlerta, type FilaViva } from "./alertas-merge";

const ANTES = new Date("2026-08-20T12:00:00Z");
const DESPUES = new Date("2026-09-01T12:00:00Z");

function borrador(tipo: AlertaDraft["tipo"], cobroId: string | undefined, over: Partial<AlertaDraft> = {}): AlertaDraft {
  return {
    dedupeKey: `${tipo}:cuenta1:${cobroId ?? "cuenta"}`,
    tipo,
    urgencia: "ALTA",
    cuentaId: "cuenta1",
    cobroId,
    mensaje: `${tipo} de ${cobroId ?? "la cuenta"}`,
    evidencia: { tipo },
    ...over,
  };
}

function fila(tipo: string, cobroId: string | null, over: Partial<FilaViva> = {}): FilaViva {
  return {
    id: `fila-${tipo}-${cobroId ?? "cuenta"}`,
    dedupeKey: `${tipo}:cuenta1:${cobroId ?? "cuenta"}`,
    tipo,
    urgencia: "ALTA",
    cobroId,
    lastDetectedAt: ANTES,
    ...over,
  };
}

describe("resolverMergeAlerta", () => {
  it("a) sin fila viva → se crea", () => {
    expect(resolverMergeAlerta(borrador("COBRO_VENCIDO", "co1"), [])).toEqual({ accion: "crear" });
  });

  it("b) ⛔ mismo tipo: se funde sin reabrir — el «Posponer» manual sobrevive al corte", () => {
    const d = borrador("COBRO_VENCIDO", "co1", { mensaje: "vencido hace 30 días" });
    const r = resolverMergeAlerta(d, [fila("COBRO_VENCIDO", "co1")]);
    expect(r).toMatchObject({
      accion: "fundir",
      id: "fila-COBRO_VENCIDO-co1",
      tipo: "COBRO_VENCIDO",
      mensaje: "vencido hace 30 días",
      reabrir: false,
    });
    /* Lo mismo con PROMESA_INCUMPLIDA ya incumplida: si Alex la pospuso después de verla subir, el
       corte siguiente no se la vuelve a poner adelante. */
    const incumplida = resolverMergeAlerta(borrador("PROMESA_INCUMPLIDA", "co1"), [fila("PROMESA_INCUMPLIDA", "co1")]);
    expect(incumplida).toMatchObject({ accion: "fundir", reabrir: false });
  });

  it("c) mismo tipo: la urgencia sube si hace falta y nunca baja (los demás tipos, igual que siempre)", () => {
    const sube = resolverMergeAlerta(borrador("CUENTA_SIN_DATOS", undefined, { urgencia: "MEDIA" }), [
      fila("CUENTA_SIN_DATOS", null, { urgencia: "BAJA" }),
    ]);
    expect(sube).toMatchObject({ accion: "fundir", urgencia: "MEDIA", reabrir: false });

    const noBaja = resolverMergeAlerta(borrador("CUENTA_SIN_DATOS", undefined, { urgencia: "BAJA" }), [
      fila("CUENTA_SIN_DATOS", null, { urgencia: "MEDIA" }),
    ]);
    expect(noBaja).toMatchObject({ accion: "fundir", urgencia: "MEDIA" });
  });

  it("d) vencido → promesa incumplida: la MISMA fila sube, vuelve a abrirse y pierde el posponer", () => {
    const r = resolverMergeAlerta(borrador("PROMESA_INCUMPLIDA", "co1"), [fila("COBRO_VENCIDO", "co1")]);
    expect(r).toEqual({
      accion: "fundir",
      id: "fila-COBRO_VENCIDO-co1",
      tipo: "PROMESA_INCUMPLIDA",
      dedupeKey: "PROMESA_INCUMPLIDA:cuenta1:co1",
      urgencia: "ALTA",
      mensaje: "PROMESA_INCUMPLIDA de co1",
      evidencia: { tipo: "PROMESA_INCUMPLIDA" },
      reabrir: true,
    });
  });

  it("e) ALMOTEC: la «falta facturar» pospuesta y la promesa incumplida quedan en UNA fila", () => {
    /* ALMOTEC, cuota de jun: su FACTURACION_ATRASADA seguía abierta y pospuesta al 31-ago cuando la
       factura ya estaba emitida (19-ago) y la promesa de ese 31-ago se incumplió. */
    const atrasada = fila("FACTURACION_ATRASADA", "almotec-jun", { urgencia: "ALTA" });
    const r = resolverMergeAlerta(borrador("PROMESA_INCUMPLIDA", "almotec-jun"), [atrasada]);
    expect(r).toMatchObject({
      accion: "fundir",
      id: atrasada.id,
      tipo: "PROMESA_INCUMPLIDA",
      dedupeKey: "PROMESA_INCUMPLIDA:cuenta1:almotec-jun",
      reabrir: true,
    });
  });

  it("e2) ⛔ Ecoquintas: la «falta facturar» pospuesta sube a vencido y se reabre, sin heredar el posponer", () => {
    /* Medido el 2026-09-12: su FACTURACION_ATRASADA seguía viva y pospuesta al 30-sep, la fecha de su
       promesa (el auto-posponer ya retirado). La factura del 3-sep vence por crédito el 18-sep: sin
       reabrir, el «Cobro vencido» del 19-sep se quedaba con ese posponer y los US$1.880 vencidos no
       aparecían en el feed hasta el 30-sep. Decisión 5 de Alex: la alerta no desaparece. */
    for (const desde of ["FACTURACION_ATRASADA", "COBRO_PROXIMO"]) {
      const r = resolverMergeAlerta(borrador("COBRO_VENCIDO", "ecoquintas-jun"), [fila(desde, "ecoquintas-jun")]);
      expect(r, desde).toMatchObject({
        accion: "fundir",
        tipo: "COBRO_VENCIDO",
        dedupeKey: "COBRO_VENCIDO:cuenta1:ecoquintas-jun",
        reabrir: true,
      });
    }
  });

  it("f) incumplida → vencido otra vez (prometió otra fecha): cambia de tipo sin reabrir ni tocar el posponer", () => {
    const r = resolverMergeAlerta(borrador("COBRO_VENCIDO", "co1"), [fila("PROMESA_INCUMPLIDA", "co1")]);
    expect(r).toMatchObject({ accion: "fundir", tipo: "COBRO_VENCIDO", reabrir: false });
  });

  it("g) un cambio dentro de la familia toma la urgencia del corte, también para abajo", () => {
    /* Revertir la factura devuelve el cobro a «falta facturar»: la fila describe la situación de
       hoy, no la peor que tuvo. */
    const r = resolverMergeAlerta(borrador("COBRO_PROXIMO", "co1", { urgencia: "MEDIA" }), [fila("COBRO_VENCIDO", "co1")]);
    expect(r).toMatchObject({ accion: "fundir", tipo: "COBRO_PROXIMO", urgencia: "MEDIA", reabrir: false });
  });

  it("h) fuera de la familia se busca por clave: una INCONSISTENCIA_CICLO no se funde con el vencido del cobro", () => {
    expect(resolverMergeAlerta(borrador("INCONSISTENCIA_CICLO", "co1", { urgencia: "MEDIA" }), [fila("COBRO_VENCIDO", "co1")])).toEqual({
      accion: "crear",
    });
    expect(resolverMergeAlerta(borrador("COBRO_VENCIDO", "co1"), [fila("INCONSISTENCIA_CICLO", "co1")])).toEqual({
      accion: "crear",
    });
  });

  it("i) no se mezclan cobros: el vencido de otro cobro no es esta fila", () => {
    expect(resolverMergeAlerta(borrador("PROMESA_INCUMPLIDA", "co1"), [fila("COBRO_VENCIDO", "co2")])).toEqual({
      accion: "crear",
    });
  });

  it("j) con varias filas vivas manda la de la misma clave; si no hay, la más reciente", () => {
    const vieja = fila("COBRO_PROXIMO", "co1", { lastDetectedAt: ANTES });
    const reciente = fila("FACTURACION_ATRASADA", "co1", { lastDetectedAt: DESPUES });
    const mismaClave = fila("COBRO_VENCIDO", "co1", { lastDetectedAt: ANTES });

    expect(resolverMergeAlerta(borrador("COBRO_VENCIDO", "co1"), [vieja, reciente, mismaClave])).toMatchObject({
      id: mismaClave.id,
      reabrir: false,
    });
    expect(resolverMergeAlerta(borrador("PROMESA_INCUMPLIDA", "co1"), [vieja, reciente])).toMatchObject({
      id: reciente.id,
      reabrir: true,
    });
  });
});
