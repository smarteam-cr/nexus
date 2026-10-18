/**
 * lib/finanzas/por-facturar.ts — DE QUÉ ESTÁ HECHA LA LÍNEA DE «POR FACTURAR» Y CUÁNTO FALTA. PURO.
 *
 * En el punto de equilibrio, la línea «Por facturar» son las cuotas programadas que todavía no tienen factura
 * (`FilaMes.pendienteFacturar`). Sube al final del año porque ahí están las cuotas de lo ya vendido. Esta función la
 * parte en lo que la hace subir (iniciativa C de docs/roadmap.md):
 *
 *  · Recurrencia: cuotas de servicios RECURRENTE.
 *  · Proyectos: cuotas de servicios PROYECTO (lo vendido que falta facturar).
 *  · Expansiones en el pipeline: los negocios abiertos de HubSpot de empresas que YA son clientes, por su monto ×
 *    probabilidad, en el mes de su cierre. Todavía no son «por facturar»: van al lado, para ver qué la haría subir.
 *  · Lo que falta para el objetivo del mes (la meta del año ÷ 12, o el piso si el año no tiene meta), después de lo
 *    facturado y lo programado.
 *
 * ⚠ La parte de cada modalidad sale de las cuotas crudas y se ESCALA al número del reporte de ese mes: así la suma da
 * exactamente la línea que se ve en el gráfico (el reporte ya descuenta las licencias revendidas). Un mes con línea y sin
 * cuotas crudas que la expliquen queda como «sin desglose».
 *
 * ⛔ No convierte: todo llega en la moneda de presentación del reporte (dólares).
 */

export type Modalidad = "RECURRENTE" | "PROYECTO";

export interface CuotaPorFacturar {
  /** El mes al que el reporte imputa la cuota. */
  periodo: string;
  modalidad: Modalidad;
  monto: number;
}

export interface NegocioDelPipeline {
  /** El mes de su fecha de cierre. */
  periodo: string;
  /** Monto × probabilidad. */
  ponderado: number;
  /** La empresa ya es cliente: es una expansión. */
  esExpansion: boolean;
}

export interface MesDelReporte {
  periodo: string;
  facturado: number;
  pendienteFacturar: number;
  futuro: boolean;
}

export interface MesDePorFacturar {
  periodo: string;
  porFacturar: number;
  recurrencia: number;
  proyectos: number;
  /** La parte de la línea que no explican las cuotas crudas (no debería pasar; se dice si pasa). */
  sinDesglose: number;
  expansiones: number;
  nuevos: number;
  objetivo: number;
  /** objetivo − facturado − por facturar, nunca negativo. En un mes que ya pasó es lo que no se alcanzó. */
  falta: number;
}

export interface LineaDePorFacturar {
  meses: MesDePorFacturar[];
  /** De dónde sale el objetivo de cada mes. */
  objetivo: { fuente: "meta" | "piso"; mensual: number };
  totales: { porFacturar: number; recurrencia: number; proyectos: number; expansiones: number; nuevos: number; falta: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineaDePorFacturar(
  meses: readonly MesDelReporte[],
  cuotas: readonly CuotaPorFacturar[],
  pipeline: readonly NegocioDelPipeline[],
  objetivo: { fuente: "meta" | "piso"; mensual: number },
): LineaDePorFacturar {
  const totales = { porFacturar: 0, recurrencia: 0, proyectos: 0, expansiones: 0, nuevos: 0, falta: 0 };
  const salida = meses.map((m): MesDePorFacturar => {
    const delMes = cuotas.filter((c) => c.periodo === m.periodo && c.monto > 0);
    const rec = delMes.filter((c) => c.modalidad === "RECURRENTE").reduce((a, c) => a + c.monto, 0);
    const pro = delMes.filter((c) => c.modalidad === "PROYECTO").reduce((a, c) => a + c.monto, 0);
    const crudo = rec + pro;
    const linea = Math.max(0, m.pendienteFacturar);
    const recurrencia = crudo > 0 ? (linea * rec) / crudo : 0;
    const proyectos = crudo > 0 ? linea - recurrencia : 0;
    const neg = pipeline.filter((n) => n.periodo === m.periodo && n.ponderado > 0);
    const expansiones = neg.filter((n) => n.esExpansion).reduce((a, n) => a + n.ponderado, 0);
    const nuevos = neg.filter((n) => !n.esExpansion).reduce((a, n) => a + n.ponderado, 0);
    const falta = Math.max(0, objetivo.mensual - Math.max(0, m.facturado) - linea);
    totales.porFacturar += linea;
    totales.recurrencia += recurrencia;
    totales.proyectos += proyectos;
    totales.expansiones += expansiones;
    totales.nuevos += nuevos;
    totales.falta += m.futuro ? falta : 0;
    return {
      periodo: m.periodo,
      porFacturar: r2(linea),
      recurrencia: r2(recurrencia),
      proyectos: r2(proyectos),
      sinDesglose: crudo > 0 ? 0 : r2(linea),
      expansiones: r2(expansiones),
      nuevos: r2(nuevos),
      objetivo: r2(objetivo.mensual),
      falta: r2(falta),
    };
  });
  return {
    meses: salida,
    objetivo,
    totales: {
      porFacturar: r2(totales.porFacturar),
      recurrencia: r2(totales.recurrencia),
      proyectos: r2(totales.proyectos),
      expansiones: r2(totales.expansiones),
      nuevos: r2(totales.nuevos),
      falta: r2(totales.falta),
    },
  };
}

export interface CaminoALaMeta {
  anio: number;
  meta: number;
  /** La recurrencia de hoy, por mes (el promedio de los meses que se pasen) y por 12. */
  recurrenciaMensual: number;
  recurrenciaAnual: number;
  /** Expansiones y negocios nuevos en el pipeline que cierran hasta el fin del año de la meta, ponderados. */
  expansiones: number;
  nuevos: number;
  /** Lo que falta después de la recurrencia de hoy y de todo el pipeline ponderado. Nunca negativo. */
  falta: number;
  /** Cuánta recurrencia NUEVA al mes cubriría lo que falta, si arrancara en enero del año de la meta. */
  recurrenciaNuevaPorMes: number;
}

/**
 * El camino a la meta: con la recurrencia de hoy entra `recurrenciaAnual`; el pipeline suma lo ponderado; lo que queda es
 * lo que hay que vender. Es una cuenta, no una predicción: no supone que la recurrencia crezca ni que se pierda.
 */
export function caminoALaMeta(o: {
  anio: number;
  meta: number;
  /** La recurrencia facturable de cada uno de los últimos meses (en la moneda de presentación). */
  recurrenciaDeLosUltimosMeses: readonly number[];
  pipeline: readonly NegocioDelPipeline[];
}): CaminoALaMeta {
  const meses = o.recurrenciaDeLosUltimosMeses.filter((x) => Number.isFinite(x) && x >= 0);
  const recurrenciaMensual = meses.length ? meses.reduce((a, x) => a + x, 0) / meses.length : 0;
  const recurrenciaAnual = recurrenciaMensual * 12;
  const hasta = `${o.anio}-12`;
  const enPlazo = o.pipeline.filter((n) => n.periodo <= hasta && n.ponderado > 0);
  const expansiones = enPlazo.filter((n) => n.esExpansion).reduce((a, n) => a + n.ponderado, 0);
  const nuevos = enPlazo.filter((n) => !n.esExpansion).reduce((a, n) => a + n.ponderado, 0);
  const falta = Math.max(0, o.meta - recurrenciaAnual - expansiones - nuevos);
  return {
    anio: o.anio,
    meta: o.meta,
    recurrenciaMensual: r2(recurrenciaMensual),
    recurrenciaAnual: r2(recurrenciaAnual),
    expansiones: r2(expansiones),
    nuevos: r2(nuevos),
    falta: r2(falta),
    recurrenciaNuevaPorMes: r2(falta / 12),
  };
}
