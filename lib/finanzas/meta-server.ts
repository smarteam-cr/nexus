/**
 * lib/finanzas/meta-server.ts — la meta del año, lo facturado de cada año y de qué está hecha la línea de «por
 * facturar» (iniciativa C de docs/roadmap.md). SERVER-ONLY. SOLO DIRECCIÓN: lo llaman las páginas de Rentabilidad y del
 * punto de equilibrio y la ruta /api/cobranza/costos/meta (guardCostosAccess).
 *
 * La cuenta vive en los módulos puros: lib/finanzas/meta.ts (los años y la meta) y lib/finanzas/por-facturar.ts (la
 * línea). Acá solo se lee la base y se convierte para la presentación con `convertir` (lib/finanzas/equilibrio.ts, el
 * único punto) y la tasa de cada mes. `lib/finanzas/equilibrio.ts` no se toca: se lee el reporte que ya arma.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { convertir, tipoIngresoDeCobro, type MonedaEq, type ReporteEquilibrio, type TasaDeMes } from "@/lib/finanzas/equilibrio";
import { cargarTasasDelAnio } from "@/lib/finanzas/tipo-cambio-server";
import { cargarLicencias } from "@/lib/finanzas/licencias-server";
import { parteDeServicio } from "@/lib/finanzas/licencias";
import { PIPELINES_VENTA_PROPIA } from "@/lib/ventas/pipelines";
import { CobranzaError } from "@/lib/cobranza/mutations";
import {
  aniosDeLaBarra,
  facturadoPorMes,
  leerLaMeta,
  metasVigentes,
  type DocumentoParaLaMeta,
  type MetaVigente,
  type MetaYPorFacturar,
} from "./meta";
import { caminoALaMeta, lineaDePorFacturar, type CuotaPorFacturar, type NegocioDelPipeline } from "./por-facturar";
export type { MetaYPorFacturar } from "./meta";

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Las tasas de los años que se piden, juntas: periodo → tasa del mes. */
async function tasasDe(anios: readonly number[], hoyISO: string): Promise<Map<string, TasaDeMes>> {
  const listas = await Promise.all([...new Set(anios)].map((a) => cargarTasasDelAnio(a, hoyISO)));
  return new Map(listas.flatMap((l) => l.tasas).map((t) => [t.periodo, t]));
}

const aDolaresCon = (tasas: Map<string, TasaDeMes>) => (monto: number, moneda: string, periodo: string) => {
  if (moneda !== "USD" && moneda !== "CRC") return null;
  return convertir(monto, moneda as MonedaEq, "USD", tasas.get(periodo) ?? null)?.monto ?? null;
};

/** Las metas definidas (todas las filas). Sin la tabla (el SQL sin aplicar), ninguna. */
export async function leerMetas(): Promise<MetaVigente[]> {
  if (!modeloDisponible(prisma.metaDeFacturacion)) return [];
  try {
    const filas = await prisma.metaDeFacturacion.findMany({ orderBy: { definidaAt: "asc" } });
    return filas.map((f) => ({ anio: f.anio, montoUsd: Number(f.montoUsd), nota: f.nota, definidaPor: f.definidaPor, definidaAt: f.definidaAt.toISOString() }));
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** Define la meta de un año: una fila nueva (append-only), firmada. */
export async function guardarMeta(anio: number, montoUsd: number, nota: string | null, por: string): Promise<void> {
  if (!modeloDisponible(prisma.metaDeFacturacion)) throw new CobranzaError("Falta aplicar el SQL de la meta (2026-10-18-rentabilidad-conectada.sql).", 503);
  try {
    await prisma.metaDeFacturacion.create({ data: { anio, montoUsd, nota, definidaPor: por } });
  } catch (e) {
    if (esquemaDesactualizado(e)) throw new CobranzaError("Falta aplicar el SQL de la meta (2026-10-18-rentabilidad-conectada.sql).", 503);
    throw e;
  }
}

/** Lo facturado en Odoo y Mercury y las comisiones de aliados confirmadas, de todos los años. */
async function documentosParaLaMeta(): Promise<DocumentoParaLaMeta[]> {
  const [odoo, mercury, comisiones] = await Promise.all([
    prisma.facturaOdoo.findMany({
      where: { state: "posted", estadoEspejo: "VIGENTE", moveType: { in: ["out_invoice", "out_refund"] } },
      select: { invoiceDate: true, moveType: true, montoNeto: true, moneda: true },
    }),
    prisma.facturaMercury.findMany({
      where: { estadoEspejo: "VIGENTE", estado: { not: "Cancelled" } },
      select: { invoiceDate: true, monto: true, moneda: true },
    }),
    prisma.comisionPartner.findMany({ where: { montoEsProyeccion: false }, select: { fecha: true, monto: true, moneda: true } }),
  ]);
  return [
    ...odoo.map((f) => ({
      fuente: "odoo" as const,
      diaISO: dia(f.invoiceDate),
      moneda: f.moneda,
      monto: (f.moveType === "out_refund" ? -1 : 1) * Number(f.montoNeto),
    })),
    ...mercury.map((f) => ({ fuente: "mercury" as const, diaISO: dia(f.invoiceDate), moneda: f.moneda, monto: Number(f.monto) })),
    ...comisiones.map((c) => ({ fuente: "aliados" as const, diaISO: dia(c.fecha), moneda: c.moneda, monto: Number(c.monto) })),
  ];
}

/** Las cuotas de un año que todavía no tienen factura, con su modalidad, en dólares (para la proporción de cada mes). */
async function cuotasPorFacturar(anio: number, hoyISO: string, tasas: Map<string, TasaDeMes>): Promise<CuotaPorFacturar[]> {
  const desde = new Date(`${anio}-01-01T00:00:00Z`);
  const hasta = new Date(`${anio + 1}-01-01T00:00:00Z`);
  const [cobros, licencias] = await Promise.all([
    prisma.cobro.findMany({
      where: { fechaEmision: null, estado: { not: "COBRADO" }, fechaProgramada: { gte: new Date(+desde - 31 * 86_400_000), lt: hasta } },
      select: {
        periodo: true,
        monto: true,
        moneda: true,
        estado: true,
        fechaProgramada: true,
        fechaEmision: true,
        fechaCobro: true,
        cuentaId: true,
        servicio: { select: { modalidad: true } },
        cuenta: { select: { creditoDias: true } },
      },
    }),
    cargarLicencias(),
  ]);
  const aDolares = aDolaresCon(tasas);
  const out: CuotaPorFacturar[] = [];
  for (const c of cobros) {
    const t = tipoIngresoDeCobro(
      {
        estado: c.estado,
        periodo: c.periodo,
        fechaProgramadaISO: dia(c.fechaProgramada),
        fechaEmisionISO: c.fechaEmision ? dia(c.fechaEmision) : null,
        fechaCobroISO: c.fechaCobro ? dia(c.fechaCobro) : null,
        creditoDias: c.cuenta.creditoDias,
      },
      hoyISO,
    );
    if (t.tipo !== "PROGRAMADO" || !t.periodo.startsWith(`${anio}-`)) continue;
    const usd = aDolares(Number(c.monto) * parteDeServicio(licencias, c.cuentaId, c.moneda, t.periodo), c.moneda, t.periodo);
    if (usd === null) continue;
    out.push({ periodo: t.periodo, modalidad: c.servicio.modalidad, monto: usd });
  }
  return out;
}

/** La recurrencia facturable de los últimos `n` meses que ya pasaron (cualquier estado), en dólares, sin licencias. */
async function recurrenciaDeLosUltimosMeses(hoyISO: string, tasas: Map<string, TasaDeMes>, n = 3): Promise<number[]> {
  const [a, m] = hoyISO.slice(0, 7).split("-").map(Number);
  const meses: string[] = [];
  for (let i = n; i >= 1; i--) {
    const t = a * 12 + (m - 1) - i;
    meses.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }
  const [cobros, licencias] = await Promise.all([
    prisma.cobro.findMany({ where: { periodo: { in: meses }, servicio: { modalidad: "RECURRENTE" } }, select: { periodo: true, monto: true, moneda: true, cuentaId: true } }),
    cargarLicencias(),
  ]);
  const aDolares = aDolaresCon(tasas);
  return meses.map((p) =>
    cobros
      .filter((c) => c.periodo === p)
      .reduce((s, c) => s + (aDolares(Number(c.monto) * parteDeServicio(licencias, c.cuentaId, c.moneda, p), c.moneda, p) ?? 0), 0),
  );
}

/** Los negocios abiertos de venta propia, ponderados, con si la empresa ya es cliente (expansión). */
async function pipelinePonderado(tasas: Map<string, TasaDeMes>, hoyISO: string): Promise<NegocioDelPipeline[]> {
  if (!modeloDisponible(prisma.negocioAbierto)) return [];
  const negocios = await prisma.negocioAbierto
    .findMany({
      where: { abierto: true, pipelineId: { in: [...PIPELINES_VENTA_PROPIA] }, fechaCierre: { gte: new Date(`${hoyISO.slice(0, 7)}-01T00:00:00Z`) } },
      select: { fechaCierre: true, monto: true, moneda: true, probabilidad: true, client: { select: { kind: true } } },
    })
    .catch((e: unknown) => {
      if (esquemaDesactualizado(e)) return [];
      throw e;
    });
  // Un negocio en colones va con la última tasa conocida: todavía no hay tasa del mes en que va a cerrar.
  const ultima = [...tasas.values()].sort((x, y) => x.periodo.localeCompare(y.periodo)).at(-1) ?? null;
  const out: NegocioDelPipeline[] = [];
  for (const n of negocios) {
    if (!n.fechaCierre || !n.monto || !n.probabilidad) continue;
    const periodo = dia(n.fechaCierre).slice(0, 7);
    const monto = Number(n.monto) * Math.max(0, Math.min(1, n.probabilidad));
    const usd = n.moneda === "USD" ? monto : n.moneda === "CRC" ? (convertir(monto, "CRC", "USD", ultima)?.monto ?? null) : null;
    if (usd === null) continue;
    out.push({ periodo, ponderado: usd, esExpansion: n.client?.kind === "CLIENTE" });
  }
  return out;
}


/**
 * Todo lo de la meta y la línea de «por facturar». `reporte` es el del año en curso (`loadReporteAnual`): de ahí salen
 * lo facturado y lo programado de cada mes, y el piso. Sin él (Rentabilidad no lo pide), la línea no se arma y lo por
 * facturar del año sale de las cuotas.
 */
export async function cargarMetaYPorFacturar(hoyISO: string, reporte?: ReporteEquilibrio | null): Promise<MetaYPorFacturar> {
  const anio = Number(hoyISO.slice(0, 4));
  const [docs, historial] = await Promise.all([documentosParaLaMeta(), leerMetas()]);
  const meses = facturadoPorMes(docs);
  const aniosConDatos = [...new Set(meses.map((m) => Number(m.periodo.slice(0, 4))))].filter((a) => a <= anio);
  const tasas = await tasasDe([...aniosConDatos, anio], hoyISO);
  const anios = aniosDeLaBarra(meses, hoyISO, aDolaresCon(tasas));
  const [cuotas, pipeline, recurrencia] = await Promise.all([cuotasPorFacturar(anio, hoyISO, tasas), pipelinePonderado(tasas, hoyISO), recurrenciaDeLosUltimosMeses(hoyISO, tasas)]);

  const vigentes = metasVigentes(historial);
  const delAnioEnCurso = vigentes.get(anio) ?? null;
  const proxima = [...vigentes.values()].filter((m) => m.anio >= anio).sort((x, y) => x.anio - y.anio)[0] ?? null;
  const porFacturarDelAnio = reporte
    ? reporte.meses.reduce((s, m) => s + m.pendienteFacturar, 0)
    : cuotas.reduce((s, c) => s + c.monto, 0);

  const objetivo = delAnioEnCurso
    ? { fuente: "meta" as const, mensual: delAnioEnCurso.montoUsd / 12 }
    : { fuente: "piso" as const, mensual: reporte?.pisoVigente?.base ?? reporte?.equilibrio.base ?? 0 };
  const linea = reporte ? lineaDePorFacturar(reporte.meses, cuotas, pipeline, objetivo) : null;

  return {
    hoyISO,
    anios,
    historial,
    meta: proxima ? leerLaMeta(anios, proxima, porFacturarDelAnio) : null,
    linea,
    camino: proxima ? caminoALaMeta({ anio: proxima.anio, meta: proxima.montoUsd, recurrenciaDeLosUltimosMeses: recurrencia, pipeline }) : null,
    sinConvertir: anios.flatMap((a) => Object.entries(a.sinConvertir).map(([moneda, monto]) => ({ anio: a.anio, moneda, monto }))),
  };
}
