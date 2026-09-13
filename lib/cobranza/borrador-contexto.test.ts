/**
 * lib/cobranza/borrador-contexto.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/borrador-contexto.test.ts --project unit`.
 *
 * El borrador de correo de un cobro lee la bitácora y la promesa de ESA factura, nunca las de otra.
 * El caso es el de Ileana Aguilar (IIA): dos facturas pendientes, una con anotación y promesa y la
 * otra sin nada. Las entradas son ilustrativas; los textos de promesa son los que escribe
 * `cambiarEstadoCobroTx`.
 */
import { describe, it, expect } from "vitest";
import { contextoDeComunicacion, lineaDePromesa, type EntradaDeBitacora } from "./borrador-contexto";

const HOY = "2026-09-12";
const FAC_0295 = "cobro-0295";
const FAC_0338 = "cobro-0338";

const BITACORA: EntradaDeBitacora[] = [
  {
    tipo: "ACTUALIZACION_IA",
    contenido: "Resumen automático de la cuenta.",
    createdAt: new Date("2026-09-10T15:00:00Z"),
    cobroId: null,
  },
  {
    tipo: "NOTA",
    contenido: "Promesa de pago registrada: el cliente prometió pagar el 2026-09-18.",
    createdAt: new Date("2026-09-05T15:00:00Z"),
    cobroId: FAC_0295,
  },
  {
    tipo: "CORREO",
    contenido: "Re: factura 0295 — no pagamos hasta recibir los informes.",
    createdAt: new Date("2026-09-04T15:00:00Z"),
    cobroId: FAC_0295,
  },
  {
    tipo: "LLAMADA",
    contenido: "Hablé con administración: pagan a fin de mes.",
    createdAt: new Date("2026-09-01T15:00:00Z"),
    cobroId: null,
  },
  {
    tipo: "CORREO",
    contenido: "Recordatorio general de pagos pendientes.",
    createdAt: new Date("2026-08-20T15:00:00Z"),
    cobroId: null,
  },
];

describe("contextoDeComunicacion — la bitácora de ESTA factura", () => {
  it("⛔ la 0338 no lee la promesa ni el correo de la 0295: lee lo general de la cuenta", () => {
    const ctx = contextoDeComunicacion(BITACORA, FAC_0338, "pagos@iia.cr");
    expect(ctx.ultimaComunicacion).toEqual({
      fechaISO: "2026-09-01",
      tipo: "LLAMADA",
      resumen: "Hablé con administración: pagan a fin de mes.",
    });
    expect(ctx.hiloReciente).toBe("Recordatorio general de pagos pendientes.");
    expect(JSON.stringify(ctx)).not.toContain("2026-09-18");
    expect(JSON.stringify(ctx)).not.toContain("informes");
    expect(ctx.correoCobro).toBe("pagos@iia.cr");
  });

  it("la 0295 lee lo suyo: su promesa es la última comunicación y su correo es el hilo", () => {
    const ctx = contextoDeComunicacion(BITACORA, FAC_0295, null);
    expect(ctx.ultimaComunicacion?.resumen).toContain("prometió pagar el 2026-09-18");
    expect(ctx.hiloReciente).toContain("informes");
  });

  it("una actualización de la IA nunca es «la última comunicación humana»", () => {
    const ctx = contextoDeComunicacion(BITACORA, FAC_0338, null);
    expect(ctx.ultimaComunicacion?.tipo).not.toBe("ACTUALIZACION_IA");
  });

  it("sin cobro pedido es el contexto de la cuenta entera", () => {
    const ctx = contextoDeComunicacion(BITACORA, null, null);
    expect(ctx.ultimaComunicacion?.resumen).toContain("2026-09-18");
  });

  it("no depende del orden en que llegan las entradas", () => {
    const ctx = contextoDeComunicacion([...BITACORA].reverse(), FAC_0338, null);
    expect(ctx.ultimaComunicacion?.fechaISO).toBe("2026-09-01");
  });

  it("sin nada que le corresponda, no inventa historial", () => {
    const soloDeOtra = BITACORA.filter((e) => e.cobroId === FAC_0295);
    expect(contextoDeComunicacion(soloDeOtra, FAC_0338, null)).toEqual({
      ultimaComunicacion: null,
      hiloReciente: null,
      correoCobro: null,
    });
  });
});

describe("lineaDePromesa — la promesa de ESTA factura, dicha como marca", () => {
  const facturada = { estado: "POR_COBRAR", fechaEmisionISO: "2026-09-04" };

  it("vigente: nombra la fecha y aclara que sigue siendo deuda", () => {
    const linea = lineaDePromesa({ ...facturada, promesaPagoISO: "2026-09-18" }, HOY);
    expect(linea).toContain("prometió pagar el 2026-09-18");
    expect(linea).toContain("sigue siendo deuda");
  });

  it("incumplida: dice cuántos días pasaron sin depósito", () => {
    const linea = lineaDePromesa({ ...facturada, promesaPagoISO: "2026-09-18" }, "2026-09-21");
    expect(linea).toContain("pasaron 3 día(s) sin depósito");
    expect(linea).toContain("incumplida");
  });

  it("la 0338, que no tiene promesa, no hereda la de la 0295", () => {
    expect(lineaDePromesa({ ...facturada, promesaPagoISO: null }, HOY)).toBeNull();
  });

  it("sin factura o ya cobrado, la promesa no se menciona", () => {
    expect(lineaDePromesa({ estado: "PROGRAMADO", fechaEmisionISO: null, promesaPagoISO: "2026-10-05" }, HOY)).toBeNull();
    expect(lineaDePromesa({ estado: "COBRADO", fechaEmisionISO: "2026-02-15", promesaPagoISO: "2026-08-07" }, HOY)).toBeNull();
  });

  it("una fecha con hora sale como su día", () => {
    expect(lineaDePromesa({ ...facturada, promesaPagoISO: "2026-09-18T00:00:00.000Z" }, HOY)).toContain("el 2026-09-18.");
  });
});
