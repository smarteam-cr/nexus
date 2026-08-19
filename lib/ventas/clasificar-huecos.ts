/**
 * lib/ventas/clasificar-huecos.ts
 *
 * Aritmética PURA del espejo de ventas: cero Prisma, cero red, cero `new Date()`.
 * Contesta dos preguntas sobre un año de ventas ganadas:
 *   · ¿cuánto se vendió?
 *   · ¿qué ventas nunca llegaron a cobranza? — el hueco
 *
 * ⚠ EL HUECO SE MIDE POR MONTO, NO POR CLIENTE. La primera versión de esta cuenta
 * preguntaba "¿este cliente tiene algún cobro?" y con eso ACCCSA —que vendió $26.200 y
 * tiene $4.560 cargados— caía entero en la columna "con cobranza", escondiendo $21.640.
 * El hueco medido así daba $71.066 cuando el real es ≥ $102.240. Un booleano por cliente
 * no puede contestar una pregunta de plata.
 */

/** Una venta ganada, en la forma mínima que hace falta para clasificar. */
export interface VentaParaClasificar {
  hubspotDealId: string;
  nombre: string;
  /** "YYYY-MM-DD" */
  fechaCierre: string;
  /** Ya convertido a la moneda de presentación por el llamador. null = no se pudo. */
  monto: number | null;
  pipelineId: string;
  clientId: string | null;
  excluida: boolean;
  sospechaPrueba: boolean;
}

/** Lo que cobranza tiene cargado de un cliente, ya sumado por el llamador. */
export interface CobranzaDeCliente {
  clientId: string;
  /** Suma de lo facturado (cobrado + por cobrar) de ese cliente en el año. */
  facturado: number;
}

export type ClaseHueco =
  | "CON_COBRANZA" // la venta está cubierta por facturación de ese cliente
  | "PARCIAL" // el cliente factura, pero menos de lo que vendió
  | "SIN_COBRANZA" // el cliente existe y no tiene nada cargado
  | "SIN_CLIENTE" // la venta no resuelve a ningún cliente de Nexus
  | "SIN_CONVERTIR" // no se pudo pasar a la moneda de presentación
  | "EXCLUIDA"; // prueba o descartada a mano

export interface VentaClasificada extends VentaParaClasificar {
  clase: ClaseHueco;
  /** Cuánto de esta venta NO está respaldado por facturación. 0 si está cubierta. */
  descubierto: number;
}

export interface ResumenVentas {
  anio: number;
  /** Solo las que cuentan: ni excluidas, ni de pipelines fuera de `pipelinesQueCuentan`. */
  vendido: number;
  cuantas: number;
  /** Ventas que el filtro de pipeline dejó afuera, para poder declararlas. */
  fueraDePipeline: { cuantas: number; monto: number };
  excluidas: { cuantas: number; monto: number };
  sinConvertir: { cuantas: number; monto: number };
  /** El hueco, medido por MONTO. */
  hueco: number;
  porClase: Record<ClaseHueco, { cuantas: number; monto: number; descubierto: number }>;
  ventas: VentaClasificada[];
  porMes: Array<{ periodo: string; vendido: number; cuantas: number }>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const CLASES: ClaseHueco[] = [
  "CON_COBRANZA",
  "PARCIAL",
  "SIN_COBRANZA",
  "SIN_CLIENTE",
  "SIN_CONVERTIR",
  "EXCLUIDA",
];

/**
 * Clasifica las ventas de un año y mide el hueco contra lo que cobranza tiene.
 *
 * `pipelinesQueCuentan` decide qué es "venta nuestra". Se pasa por parámetro y no se
 * hardcodea porque es una decisión de negocio abierta: "HubSpot Shared Selling" tiene más
 * plata ganada que el pipeline de ventas propio, pero es registro de oportunidad con
 * HubSpot y no facturación de la casa. Lo que quede afuera se DECLARA, no se esconde.
 */
export function clasificarVentas(
  ventas: readonly VentaParaClasificar[],
  cobranza: readonly CobranzaDeCliente[],
  opciones: { anio: number; pipelinesQueCuentan: readonly string[] },
): ResumenVentas {
  const facturadoDe = new Map(cobranza.map((c) => [c.clientId, c.facturado]));
  // Lo que ya "consumió" cada cliente: una venta se respalda con la facturación que
  // queda, no con la total — si no, dos ventas del mismo cliente se cubrirían las dos
  // con la misma plata.
  const restante = new Map(cobranza.map((c) => [c.clientId, c.facturado]));

  const cuentan = new Set(opciones.pipelinesQueCuentan);
  const clasificadas: VentaClasificada[] = [];
  const fuera = { cuantas: 0, monto: 0 };
  const excluidas = { cuantas: 0, monto: 0 };
  const sinConvertir = { cuantas: 0, monto: 0 };
  const porMes = new Map<string, { vendido: number; cuantas: number }>();
  let vendido = 0;
  let cuantas = 0;

  // Las más grandes primero: si un cliente tiene varias ventas y no alcanza la
  // facturación para todas, es más honesto que la grande quede cubierta y la chica
  // descubierta que al revés — el descubierto total es el mismo, pero la lista de
  // huecos queda encabezada por lo que de verdad falta mirar.
  const orden = [...ventas].sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));

  for (const v of orden) {
    if (v.excluida) {
      excluidas.cuantas++;
      excluidas.monto = round2(excluidas.monto + (v.monto ?? 0));
      clasificadas.push({ ...v, clase: "EXCLUIDA", descubierto: 0 });
      continue;
    }
    if (!cuentan.has(v.pipelineId)) {
      fuera.cuantas++;
      fuera.monto = round2(fuera.monto + (v.monto ?? 0));
      continue; // fuera del alcance: no entra a ninguna clase ni al vendido
    }
    if (v.monto === null) {
      sinConvertir.cuantas++;
      clasificadas.push({ ...v, clase: "SIN_CONVERTIR", descubierto: 0 });
      continue;
    }

    vendido = round2(vendido + v.monto);
    cuantas++;
    const mes = v.fechaCierre.slice(0, 7);
    const g = porMes.get(mes) ?? { vendido: 0, cuantas: 0 };
    porMes.set(mes, { vendido: round2(g.vendido + v.monto), cuantas: g.cuantas + 1 });

    if (!v.clientId) {
      clasificadas.push({ ...v, clase: "SIN_CLIENTE", descubierto: v.monto });
      continue;
    }
    const disponible = restante.get(v.clientId) ?? 0;
    if (disponible <= 0) {
      const clase: ClaseHueco = (facturadoDe.get(v.clientId) ?? 0) > 0 ? "PARCIAL" : "SIN_COBRANZA";
      clasificadas.push({ ...v, clase, descubierto: v.monto });
      continue;
    }
    const cubierto = Math.min(disponible, v.monto);
    restante.set(v.clientId, round2(disponible - cubierto));
    const descubierto = round2(v.monto - cubierto);
    clasificadas.push({
      ...v,
      clase: descubierto > 0 ? "PARCIAL" : "CON_COBRANZA",
      descubierto,
    });
  }

  const porClase = Object.fromEntries(
    CLASES.map((c) => [c, { cuantas: 0, monto: 0, descubierto: 0 }]),
  ) as ResumenVentas["porClase"];
  for (const v of clasificadas) {
    const g = porClase[v.clase];
    g.cuantas++;
    g.monto = round2(g.monto + (v.monto ?? 0));
    g.descubierto = round2(g.descubierto + v.descubierto);
  }

  return {
    anio: opciones.anio,
    vendido,
    cuantas,
    fueraDePipeline: fuera,
    excluidas,
    sinConvertir,
    hueco: round2(clasificadas.reduce((n, v) => n + v.descubierto, 0)),
    porClase,
    ventas: clasificadas,
    porMes: [...porMes.entries()]
      .map(([periodo, g]) => ({ periodo, ...g }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo)),
  };
}

/**
 * ¿El nombre de un trato huele a prueba? MARCA, no excluye: la persona decide.
 *
 * ⚠ Los límites de palabra no son decoración: sin ellos "Protesta S.A." contiene "test"
 * y una venta real queda marcada como basura. Lo cazó su propio test.
 */
export function huelaAPrueba(nombre: string): boolean {
  return /\b(prueba|pruebas|test|testing|demo interno)\b/i.test(nombre);
}
