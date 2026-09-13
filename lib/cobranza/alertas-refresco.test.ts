/**
 * lib/cobranza/alertas-refresco.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/alertas-refresco.test.ts --project unit`.
 *
 * El refresco de alertas de cada noche: abre solo la deuda del cliente, mide el cierre contra el set
 * completo del motor, usa el día de Costa Rica y NO guarda corte. La base, la cartera y las
 * escrituras están simuladas; el motor y las reglas de cierre son los de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CarteraEngineInput } from "./engine";

const { buildCarteraEngineInput, upsertAlertas, cerrarAlertasQueYaNoAplican, findMany, tablasTocadas } = vi.hoisted(
  () => ({
    buildCarteraEngineInput: vi.fn(),
    upsertAlertas: vi.fn(),
    cerrarAlertasQueYaNoAplican: vi.fn(),
    findMany: vi.fn(),
    tablasTocadas: [] as string[],
  }),
);

/* La base anota cada tabla que se toca: así se prueba que el refresco no guarda la foto de la
   cartera (ni extiende suscripciones) sin depender de cómo se llamaría esa escritura. */
vi.mock("@/lib/db/prisma", () => {
  const tablas: Record<string, unknown> = { alertaCobro: { findMany } };
  return {
    prisma: new Proxy(tablas, {
      get(objetivo, tabla) {
        if (typeof tabla === "string" && tabla !== "then") tablasTocadas.push(tabla);
        return typeof tabla === "string" ? objetivo[tabla] : undefined;
      },
    }),
  };
});
vi.mock("./queries", () => ({ buildCarteraEngineInput }));
vi.mock("./mutations", () => ({ upsertAlertas, cerrarAlertasQueYaNoAplican }));

import { refrescarAlertasDeCobranza } from "./alertas-refresco";
import { TIPOS_DEL_MOTOR } from "./alertas-cierre";

type Cuenta = CarteraEngineInput["cuentas"][number];
type Cobro = Cuenta["cobros"][number];

function cobro(cobroId: string, over: Partial<Cobro> = {}): Cobro {
  return {
    cobroId,
    servicioId: "s1",
    estado: "POR_COBRAR",
    origen: "IMPORTACION",
    fechaProgramadaISO: "2026-08-15",
    monto: 1000,
    fechaEmisionISO: "2026-08-15",
    ...over,
  };
}

function cuenta(cuentaId: string, cobros: Cobro[], over: Partial<Cuenta> = {}): Cuenta {
  return {
    cuentaId,
    clienteNombre: cuentaId,
    excluidaOperacion: false,
    tieneCuenta: true,
    servicios: [
      { servicioId: "s1", descripcion: null, estado: "ACTIVO", fechaInicioFacturacion: "2026-01-15", anchorActualISO: null },
    ],
    cobros,
    ...over,
  };
}

/** 7:00 del 12-sep en Costa Rica. */
const MANANA_DEL_12 = new Date("2026-09-12T13:00:00Z");

beforeEach(() => {
  buildCarteraEngineInput.mockReset();
  findMany.mockReset().mockResolvedValue([]);
  upsertAlertas.mockReset().mockResolvedValue({ created: 2, merged: 0, suppressed: 0 });
  cerrarAlertasQueYaNoAplican.mockReset().mockResolvedValue(9);
  tablasTocadas.length = 0;
});

describe("refrescarAlertasDeCobranza", () => {
  it("abre solo vencidos y promesas incumplidas, cierra contra el set completo y no guarda corte", async () => {
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("c1", [
          cobro("vencido", { fechaEmisionISO: "2026-08-01" }),
          cobro("incumplida", { fechaEmisionISO: "2026-08-19", promesaPagoISO: "2026-08-31" }),
          cobro("sin-facturar", { estado: "PROGRAMADO", fechaEmisionISO: null }),
          cobro("catch-up", { estado: "PROGRAMADO", origen: "CATCH_UP", fechaProgramadaISO: "2026-08-01", fechaEmisionISO: null }),
        ]),
        cuenta("c2", [], { servicios: [] }),
        cuenta("colby", [cobro("colby-1", { fechaEmisionISO: "2026-01-01" })], { excluidaOperacion: true }),
      ],
    };
    buildCarteraEngineInput.mockResolvedValue(cartera);

    const r = await refrescarAlertasDeCobranza(MANANA_DEL_12);

    expect(buildCarteraEngineInput).toHaveBeenCalledWith();
    expect(upsertAlertas).toHaveBeenCalledTimes(1);
    const abiertas: Array<{ dedupeKey: string }> = upsertAlertas.mock.calls[0][0];
    expect(abiertas.map((d) => d.dedupeKey).sort()).toEqual(["COBRO_VENCIDO:c1:vencido", "PROMESA_INCUMPLIDA:c1:incumplida"]);

    // El cierre recibe el set COMPLETO: si recibiera el filtrado, cerraría cada noche todo lo que no es deuda.
    expect(cerrarAlertasQueYaNoAplican).toHaveBeenCalledTimes(1);
    const [carteraDelCierre, setDelCierre] = cerrarAlertasQueYaNoAplican.mock.calls[0];
    expect(carteraDelCierre).toBe(cartera);
    expect(new Set((setDelCierre as Array<{ tipo: string }>).map((d) => d.tipo))).toEqual(
      new Set(["COBRO_VENCIDO", "PROMESA_INCUMPLIDA", "FACTURACION_ATRASADA", "INCONSISTENCIA_CICLO", "CUENTA_SIN_DATOS"]),
    );

    // Las filas vivas se leen solo de las cuentas evaluadas y de los tipos del motor.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: { in: ["ABIERTA", "VISTA"] }, cuentaId: { in: ["c1", "c2"] }, tipo: { in: [...TIPOS_DEL_MOTOR] } },
      }),
    );

    // ⛔ No es un corte: la única tabla que se toca es la de alertas.
    expect([...new Set(tablasTocadas)]).toEqual(["alertaCobro"]);

    expect(r).toEqual({ hoy: "2026-09-12", creadas: 2, fundidas: 0, suprimidas: 0, cerradas: 9 });
  });

  it("una fila que ya está en el feed se pone al día aunque no sea deuda; no se abre otra igual", async () => {
    buildCarteraEngineInput.mockResolvedValue({
      cuentas: [
        cuenta("kaizen", [
          // La factura de enero se soltó: la cuota #1 cae en la quincena sin facturar.
          cobro("kaizen-1", { estado: "PROGRAMADO", fechaProgramadaISO: "2026-09-15", fechaEmisionISO: null }),
          cobro("kaizen-otra", { estado: "PROGRAMADO", fechaProgramadaISO: "2026-09-20", fechaEmisionISO: null }),
        ]),
      ],
    });
    findMany.mockResolvedValue([
      {
        id: "fila-kaizen-1",
        dedupeKey: "COBRO_VENCIDO:kaizen:kaizen-1",
        tipo: "COBRO_VENCIDO",
        urgencia: "ALTA",
        cobroId: "kaizen-1",
        lastDetectedAt: new Date("2026-07-24T21:49:39Z"),
      },
    ]);

    await refrescarAlertasDeCobranza(MANANA_DEL_12);

    const abiertas: Array<{ dedupeKey: string }> = upsertAlertas.mock.calls[0][0];
    expect(abiertas.map((d) => d.dedupeKey)).toEqual(["COBRO_PROXIMO:kaizen:kaizen-1"]);
  });

  it("la promesa rota llega pasada la medianoche de Costa Rica, no con el día de UTC", async () => {
    buildCarteraEngineInput.mockResolvedValue({
      cuentas: [cuenta("almotec", [cobro("almotec-1", { fechaEmisionISO: "2026-08-19", promesaPagoISO: "2026-09-12" })])],
    });
    const tipos = () => (upsertAlertas.mock.calls.at(-1)?.[0] as Array<{ tipo: string }>).map((d) => d.tipo);

    // 23:30 del 12 en Costa Rica (ya es 13 en UTC): la promesa todavía vale; la factura sigue vencida.
    await refrescarAlertasDeCobranza(new Date("2026-09-13T05:30:00Z"));
    expect(tipos()).toEqual(["COBRO_VENCIDO"]);

    // 00:05 del 13 en Costa Rica: sube.
    await refrescarAlertasDeCobranza(new Date("2026-09-13T06:05:00Z"));
    expect(tipos()).toEqual(["PROMESA_INCUMPLIDA"]);
  });
});
