/**
 * lib/ventas/clasificar-huecos.test.ts
 *
 * El riesgo de este módulo no es sumar: es esconder plata. La primera versión de esta
 * cuenta preguntaba "¿el cliente tiene algún cobro?" y con eso una venta de $26.200 con
 * $4.560 cargados caía entera en "cubierta", escondiendo $21.640. Casi todos los casos de
 * acá abajo existen para que esa clase de error no vuelva.
 *
 * ÍNDICE
 *   A. lo vendido — qué cuenta y qué se declara aparte
 *   B. el hueco se mide por MONTO, no por cliente
 *   C. varias ventas del mismo cliente no se cubren con la misma plata
 *   D. bordes: sin cliente, sin convertir, excluidas
 */
import { describe, expect, it } from "vitest";
import {
  clasificarVentas,
  huelaAPrueba,
  type CobranzaDeCliente,
  type VentaParaClasificar,
} from "./clasificar-huecos";

const VENTAS = "default";
const OTRO = "81ee3345-shared-selling";

const v = (
  nombre: string,
  monto: number | null,
  extra: Partial<VentaParaClasificar> = {},
): VentaParaClasificar => ({
  hubspotDealId: `d-${nombre}`,
  nombre,
  fechaCierre: "2026-03-15",
  monto,
  pipelineId: VENTAS,
  clientId: null,
  excluida: false,
  sospechaPrueba: false,
  ...extra,
});

const cob = (clientId: string, facturado: number): CobranzaDeCliente => ({ clientId, facturado });
const OPTS = { anio: 2026, pipelinesQueCuentan: [VENTAS] };

// ── A ───────────────────────────────────────────────────────────────────────────

describe("A · lo vendido", () => {
  it("A1 suma solo los pipelines que cuentan, y DECLARA lo que dejó afuera", () => {
    const r = clasificarVentas(
      [v("propia", 1000), v("shared", 5000, { pipelineId: OTRO })],
      [],
      OPTS,
    );
    expect(r.vendido).toBe(1000);
    expect(r.cuantas).toBe(1);
    // Lo de afuera no desaparece: queda contado para poder decirlo en pantalla.
    expect(r.fueraDePipeline).toEqual({ cuantas: 1, monto: 5000, sinMonto: 0 });
  });

  it("A1b el monto de lo dejado afuera es un PISO: los tratos sin monto cuentan como cero", () => {
    // Decir "31 tratos por $211.020" cuando 12 no traen monto suena a que están los 31
    // adentro. El contador deja ver que la cifra es el piso y no el total.
    const r = clasificarVentas(
      [v("con monto", 5000, { pipelineId: OTRO }), v("sin monto", null, { pipelineId: OTRO })],
      [],
      OPTS,
    ).fueraDePipeline;
    expect(r).toEqual({ cuantas: 2, monto: 5000, sinMonto: 1 });
  });

  it("A2 el desglose por mes usa la fecha de CIERRE de la venta", () => {
    const r = clasificarVentas(
      [v("ene", 100, { fechaCierre: "2026-01-31" }), v("mar", 200, { fechaCierre: "2026-03-01" })],
      [],
      OPTS,
    );
    expect(r.porMes).toEqual([
      { periodo: "2026-01", vendido: 100, cuantas: 1 },
      { periodo: "2026-03", vendido: 200, cuantas: 1 },
    ]);
  });

  it("A3 una venta excluida no suma al vendido, no es hueco, y se cuenta aparte", () => {
    const r = clasificarVentas(
      [v("prueba", 5000, { excluida: true }), v("real", 100, { clientId: "c1" })],
      [cob("c1", 100)],
      OPTS,
    );
    expect(r.vendido).toBe(100);
    expect(r.excluidas).toEqual({ cuantas: 1, monto: 5000 });
    // La excluida no aporta hueco: descartarla no es lo mismo que no haberla facturado.
    expect(r.hueco).toBe(0);
  });
});

// ── B ───────────────────────────────────────────────────────────────────────────

describe("B · el hueco se mide por MONTO", () => {
  it("B1 EL CASO ACCCSA: un cliente que factura MENOS de lo que vendió deja hueco", () => {
    // Vendió 26.200 y tiene 4.560 cargados. Con un booleano por cliente esto daba
    // "cubierto" y escondía 21.640 — el error que motivó todo este archivo.
    const r = clasificarVentas([v("ACCCSA", 26_200, { clientId: "c1" })], [cob("c1", 4_560)], OPTS);
    expect(r.ventas[0]!.clase).toBe("PARCIAL");
    expect(r.ventas[0]!.descubierto).toBe(21_640);
    expect(r.hueco).toBe(21_640);
  });

  it("B2 un cliente que factura de más queda cubierto y el hueco es cero", () => {
    const r = clasificarVentas([v("chico", 1000, { clientId: "c1" })], [cob("c1", 5000)], OPTS);
    expect(r.ventas[0]!.clase).toBe("CON_COBRANZA");
    expect(r.hueco).toBe(0);
  });

  it("B3 un cliente SIN nada cargado deja la venta entera descubierta", () => {
    const r = clasificarVentas([v("nada", 3000, { clientId: "c1" })], [], OPTS);
    expect(r.ventas[0]!.clase).toBe("SIN_COBRANZA");
    expect(r.ventas[0]!.descubierto).toBe(3000);
  });

  it("B4 la diferencia entre SIN_COBRANZA y PARCIAL es si el cliente factura algo", () => {
    // Los dos dejan hueco, pero no son el mismo problema: uno es "falta cargar la
    // cuenta entera", el otro es "falta una parte". La pantalla los trata distinto.
    const r = clasificarVentas(
      [v("a", 1000, { clientId: "c1" }), v("b", 1000, { clientId: "c2" })],
      [cob("c2", 400)],
      OPTS,
    );
    const porNombre = new Map(r.ventas.map((x) => [x.nombre, x]));
    expect(porNombre.get("a")!.clase).toBe("SIN_COBRANZA");
    expect(porNombre.get("b")!.clase).toBe("PARCIAL");
    expect(r.hueco).toBe(1600); // 1000 + 600
  });
});

// ── C ───────────────────────────────────────────────────────────────────────────

describe("C · dos ventas del mismo cliente", () => {
  it("C1 no se cubren las dos con la misma plata", () => {
    // 1200 de facturación no puede respaldar 1000 + 800: la segunda queda a medias.
    const r = clasificarVentas(
      [v("primera", 1000, { clientId: "c1" }), v("segunda", 800, { clientId: "c1" })],
      [cob("c1", 1200)],
      OPTS,
    );
    expect(r.hueco).toBe(600); // 1800 vendidos − 1200 facturados
  });

  it("C2 la venta MÁS GRANDE se cubre primero, para que el hueco listado sea el chico", () => {
    const r = clasificarVentas(
      [v("chica", 200, { clientId: "c1" }), v("grande", 1000, { clientId: "c1" })],
      [cob("c1", 1000)],
      OPTS,
    );
    const porNombre = new Map(r.ventas.map((x) => [x.nombre, x]));
    expect(porNombre.get("grande")!.clase).toBe("CON_COBRANZA");
    expect(porNombre.get("chica")!.descubierto).toBe(200);
    expect(r.hueco).toBe(200);
  });

  it("C3 el hueco total es el mismo sin importar el orden de entrada", () => {
    const a = clasificarVentas(
      [v("x", 700, { clientId: "c1" }), v("y", 500, { clientId: "c1" })],
      [cob("c1", 900)],
      OPTS,
    );
    const b = clasificarVentas(
      [v("y", 500, { clientId: "c1" }), v("x", 700, { clientId: "c1" })],
      [cob("c1", 900)],
      OPTS,
    );
    expect(a.hueco).toBe(300);
    expect(b.hueco).toBe(300);
  });
});

// ── D ───────────────────────────────────────────────────────────────────────────

describe("D · bordes", () => {
  it("D1 una venta sin cliente cuenta al vendido y queda descubierta entera", () => {
    // Es plata vendida de verdad: que Nexus no sepa de quién es no la borra del año.
    const r = clasificarVentas([v("huerfana", 8100)], [], OPTS);
    expect(r.vendido).toBe(8100);
    expect(r.ventas[0]!.clase).toBe("SIN_CLIENTE");
    expect(r.hueco).toBe(8100);
  });

  it("D2 una venta que no se pudo convertir NO entra al vendido y se declara", () => {
    // Sin tipo de cambio del mes no se aproxima: se dice que no se pudo.
    const r = clasificarVentas([v("colones", null), v("dolares", 500)], [], OPTS);
    expect(r.vendido).toBe(500);
    expect(r.sinConvertir.cuantas).toBe(1);
    expect(r.ventas.find((x) => x.nombre === "colones")!.clase).toBe("SIN_CONVERTIR");
  });

  it("D3 sin ventas devuelve un resumen válido en cero, no NaN", () => {
    const r = clasificarVentas([], [], OPTS);
    expect(r.vendido).toBe(0);
    expect(r.hueco).toBe(0);
    expect(r.porMes).toEqual([]);
  });

  it("D4 las clases siempre están todas, aunque vengan en cero", () => {
    // Una clase que desaparece del objeto obliga a la UI a chequear undefined y ahí
    // nace el "0" que en realidad era "no se midió".
    const r = clasificarVentas([v("sola", 100)], [], OPTS);
    expect(Object.keys(r.porClase).sort()).toEqual([
      "CON_COBRANZA",
      "EXCLUIDA",
      "PARCIAL",
      "SIN_CLIENTE",
      "SIN_COBRANZA",
      "SIN_CONVERTIR",
    ]);
  });

  it("D5 el vendido es la suma de lo clasificado que cuenta", () => {
    const r = clasificarVentas(
      [
        v("a", 1000, { clientId: "c1" }),
        v("b", 500),
        v("c", 5000, { pipelineId: OTRO }),
        v("d", 300, { excluida: true }),
      ],
      [cob("c1", 1000)],
      OPTS,
    );
    expect(r.vendido).toBe(1500);
    expect(r.hueco).toBe(500);
  });
});

describe("huelaAPrueba", () => {
  it("marca los nombres de test y deja pasar las ventas reales", () => {
    expect(huelaAPrueba("Negocio para prueba (Nexus)")).toBe(true);
    expect(huelaAPrueba("TEST - integración")).toBe(true);
    expect(huelaAPrueba("AMVAC | CRECIMIENTO WEB")).toBe(false);
    expect(huelaAPrueba("Protesta S.A.")).toBe(false);
  });
});
