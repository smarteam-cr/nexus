/**
 * Lo que cuida el valor de la cuenta (iniciativa D, docs/comisiones-descuento-plan.md): el valor de 12 meses, el
 * descuento fuera de la base, el factor de la recurrencia y la aprobación de un descuento grande. El caso de Marco es la
 * prueba central: bajar una recurrencia de US$ 3.000 a US$ 2.800 al mes regala US$ 2.400 al año.
 */
import { describe, expect, it } from "vitest";
import {
  DECISIONES_DE_LA_PROPUESTA,
  FACTOR_DE_RECURRENCIA,
  comisionSobreLaBase,
  partesDeLaVenta,
  simularVendedor,
  sinCuidarElValor,
  valorDeLaVenta,
  type PropuestaDeLaVenta,
  type TramoDeMeta,
  type VentaParaSimular,
} from "./reglas";
import {
  UMBRAL_DE_APROBACION,
  aprobacionesDe,
  conAprobacion,
  descuentoDeServicios,
  estadoDeLaAprobacion,
  puedeAprobarDescuentos,
  type AprobacionDeDescuento,
} from "@/lib/business-cases/descuento";

const MARCO = { unico: 0, mensual: 2800, descontado: 2400 };

describe("el caso de Marco", () => {
  it("vale 33.600, comisiona sobre 31.200: al 5 %, US$ 1.560 en vez de US$ 1.680", () => {
    const v = valorDeLaVenta(MARCO, FACTOR_DE_RECURRENCIA, "entero");
    expect(v.valor).toBe(33600);
    expect(v.base).toBe(31200);
    expect(comisionSobreLaBase(MARCO, 5, FACTOR_DE_RECURRENCIA, "entero")).toBe(1560);
    expect(comisionSobreLaBase(MARCO, 5, 1, "nada")).toBe(1680);
  });

  it("el descuento es el 6,67 % del precio de lista: no hace falta aprobarlo", () => {
    const v = valorDeLaVenta(MARCO, FACTOR_DE_RECURRENCIA, "entero");
    expect(v.porcentajeDeDescuento).toBeCloseTo(6.67, 2);
    expect(estadoDeLaAprobacion(v.porcentajeDeDescuento, []).estado).toBe("no-hace-falta");
  });

  it("con la mitad del descuento fuera, comisiona sobre 32.400", () => {
    expect(valorDeLaVenta(MARCO, FACTOR_DE_RECURRENCIA, "mitad").base).toBe(32400);
  });

  it("el descuento no baja lo que cuenta para la meta: 33.600 × 1,2 = 40.320", () => {
    expect(valorDeLaVenta(MARCO, 1.2, "entero").paraLaMeta).toBe(40320);
    expect(valorDeLaVenta(MARCO, 1, "entero").paraLaMeta).toBe(33600);
  });
});

describe("una expansión grande cuenta por su tamaño total", () => {
  it("20.000 de una vez cuentan más para la meta que una recurrencia de 1.000 al mes con el factor", () => {
    const expansion = valorDeLaVenta({ unico: 20000, mensual: 0, descontado: 0 }, FACTOR_DE_RECURRENCIA, "entero");
    const chica = valorDeLaVenta({ unico: 0, mensual: 1000, descontado: 0 }, FACTOR_DE_RECURRENCIA, "entero");
    expect(expansion.paraLaMeta).toBe(20000);
    expect(chica.paraLaMeta).toBe(14400);
    expect(expansion.paraLaMeta).toBeGreaterThan(chica.paraLaMeta);
  });

  it("el factor no toca lo único", () => {
    expect(valorDeLaVenta({ unico: 12000, mensual: 500, descontado: 0 }, 1.2, "entero").paraLaMeta).toBe(19200);
  });
});

describe("las partes de una venta", () => {
  const venta = (p: Partial<VentaParaSimular> = {}): VentaParaSimular => ({
    id: "v",
    fecha: "2026-03-10",
    nombre: "Soporte",
    cliente: "Cliente",
    monto: 33600,
    moneda: "USD",
    refiereHubspot: false,
    primeraVenta: "2026-03-10",
    ...p,
  });
  const propuesta: PropuestaDeLaVenta = {
    id: "bc",
    nombre: "Soporte HubSpot",
    unico: 0,
    mensual: 2800,
    descontado: 2400,
    porcentaje: 6.67,
    incompleto: false,
    aprobacion: { estado: "no-hace-falta" },
  };

  it("sin propuesta ni ajuste, la venta es única y vale su monto: el cálculo de antes no se mueve", () => {
    const p = partesDeLaVenta(venta());
    expect(p).toMatchObject({ unico: 33600, mensual: 0, descontado: 0, origen: "hubspot", origenDelDescuento: "ninguno" });
  });

  it("con propuesta, sus servicios dicen lo único, lo mensual y lo descontado", () => {
    const p = partesDeLaVenta(venta({ propuesta }));
    expect(p).toMatchObject({ unico: 0, mensual: 2800, descontado: 2400, recurrente: true, origen: "propuesta", origenDelDescuento: "propuesta" });
  });

  it("marcada recurrente a mano, supone que el monto es el año", () => {
    const p = partesDeLaVenta(venta(), { recurrente: true });
    expect(p).toMatchObject({ unico: 0, mensual: 2800, mensualSupuesto: true, origen: "escrito" });
  });

  it("un descuento escrito a mano manda sobre el de la propuesta", () => {
    expect(partesDeLaVenta(venta({ propuesta }), { descuento: 6000 })).toMatchObject({ descontado: 6000, origenDelDescuento: "escrito" });
  });
});

describe("la simulación con el valor de la cuenta", () => {
  const TRAMOS: TramoDeMeta[] = [{ desde: "2026-01-01", hasta: "2026-04-01", monto: 90000, avance: null }];
  const ventas: VentaParaSimular[] = [
    { id: "marco", fecha: "2026-03-10", nombre: "Soporte", cliente: "C", monto: 33600, moneda: "USD", refiereHubspot: false, primeraVenta: "2026-03-10" },
  ];
  const ajustes = { marco: { mensual: 2800, descuento: 2400 } };
  const base = { anio: 2026, mesActual: 3, ventas, tramos: TRAMOS, ajustes };

  it("antes: 40.320 para la meta no; 33.600 al 5 % = 1.680. Después: 40.320 para la meta, 5 % de 31.200 = 1.560", () => {
    // Marzo tiene 31 de los 90 días del trimestre: meta de 31.000.
    const antes = simularVendedor({ ...base, decisiones: sinCuidarElValor(DECISIONES_DE_LA_PROPUESTA) });
    const despues = simularVendedor({ ...base, decisiones: DECISIONES_DE_LA_PROPUESTA });
    const marzoAntes = antes.periodos.find((p) => p.clave === "2026-03")!;
    const marzo = despues.periodos.find((p) => p.clave === "2026-03")!;
    expect(marzoAntes.vendido).toBe(33600);
    expect(marzoAntes.comision).toBe(1680);
    expect(marzo.vendido).toBe(40320);
    expect(marzo.comision).toBe(1560);
    expect(despues.descontadoEnServicios).toBe(2400);
    expect(despues.servicios[0].aprobacion).toEqual({ estado: "no-hace-falta" });
  });

  it("un descuento escrito a mano de más del umbral no se sabe si se aprobó", () => {
    const s = simularVendedor({ ...base, ajustes: { marco: { mensual: 2800, descuento: 8000 } }, decisiones: DECISIONES_DE_LA_PROPUESTA });
    expect(s.servicios[0].valor!.porcentajeDeDescuento).toBeGreaterThan(UMBRAL_DE_APROBACION);
    expect(s.servicios[0].aprobacion).toEqual({ estado: "sin-saber" });
  });
});

describe("el descuento de una propuesta", () => {
  it("lee los servicios recurrentes: 3.000 de lista con 200 de descuento al mes son 2.400 al año", () => {
    const d = descuentoDeServicios({
      moneda: "USD",
      lineas: [{ concepto: "Soporte mensual", monto: "$3,000", descuento: "$200", recurrencia: "mensual" }],
      licencias: [{ concepto: "Sales Hub", monto: "$500", descuento: "50%" }],
    });
    expect(d).toMatchObject({ unico: 0, mensual: 2800, descontadoMensual: 200, valor: 33600, descontado: 2400, incompleto: false });
    expect(d.porcentaje).toBeCloseTo(6.67, 2);
  });

  it("suma lo único y lo recurrente, y deja fuera las licencias", () => {
    const d = descuentoDeServicios({
      moneda: "USD",
      lineas: [
        { concepto: "Implementación", cantidad: "1", precioUnitario: "$10,000", descuento: "20%" },
        { concepto: "Soporte", monto: "$1,000", recurrencia: "mensual" },
      ],
    });
    expect(d.unico).toBe(8000);
    expect(d.mensual).toBe(1000);
    expect(d.descontado).toBe(2000);
    expect(d.porcentaje).toBeCloseTo(9.09, 2); // 2.000 de 22.000 (10.000 de lista + 12 × 1.000)
  });

  it("una línea apagada no cuenta y una ilegible deja el número incompleto", () => {
    const d = descuentoDeServicios({
      moneda: "USD",
      lineas: [
        { concepto: "Apagada", monto: "$5,000", descuento: "50%", activa: "no" },
        { concepto: "A definir", monto: "A definir" },
      ],
    });
    expect(d.descontado).toBe(0);
    expect(d.incompleto).toBe(true);
    expect(d.hayServicios).toBe(false);
  });

  it("basura o nada: sin servicios y sin descuento", () => {
    expect(descuentoDeServicios(null)).toMatchObject({ valor: 0, descontado: 0, porcentaje: 0, hayServicios: false });
  });
});

describe("la aprobación de un descuento", () => {
  const aprobo = (porcentaje: number, en = "2026-10-18T15:00:00.000Z"): AprobacionDeDescuento => ({
    porcentaje,
    descontado: 1000,
    moneda: "USD",
    porEmail: "msalas@smarteamcr.com",
    porNombre: "Marco Salas",
    en,
  });

  it("hasta el umbral no hace falta; arriba, falta hasta que alguien de dirección lo aprueba", () => {
    expect(estadoDeLaAprobacion(UMBRAL_DE_APROBACION, []).estado).toBe("no-hace-falta");
    expect(estadoDeLaAprobacion(15, []).estado).toBe("falta");
    expect(estadoDeLaAprobacion(15, [aprobo(15)]).estado).toBe("aprobado");
  });

  it("vale mientras el descuento no suba: si sube por encima de lo aprobado, vuelve a faltar", () => {
    expect(estadoDeLaAprobacion(12, [aprobo(15)]).estado).toBe("aprobado");
    const r = estadoDeLaAprobacion(18, [aprobo(15)]);
    expect(r.estado).toBe("falta");
    expect(r.estado === "falta" && r.anterior?.porcentaje).toBe(15);
  });

  it("se guarda en la entry __descuento sin tocar el resto de las secciones, y quedan las últimas 10", () => {
    const meta = { key: "__meta", caseType: "hubspot" };
    let secciones: unknown[] = [meta];
    for (let i = 0; i < 12; i++) secciones = conAprobacion(secciones, aprobo(11 + i));
    expect(secciones[0]).toBe(meta);
    expect(secciones).toHaveLength(2);
    const guardadas = aprobacionesDe(secciones);
    expect(guardadas).toHaveLength(10);
    expect(guardadas.at(-1)!.porcentaje).toBe(22);
  });

  it("aprueba dirección", () => {
    expect(puedeAprobarDescuentos("SUPER_ADMIN")).toBe(true);
    expect(puedeAprobarDescuentos("VENTAS")).toBe(false);
    expect(puedeAprobarDescuentos(null)).toBe(false);
  });
});
