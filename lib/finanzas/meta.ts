/**
 * lib/finanzas/meta.ts — LA META DEL AÑO CONTRA LO FACTURADO EN LOS AÑOS ANTERIORES. PURO.
 *
 * Iniciativa C de docs/roadmap.md (plan en docs/rentabilidad-conectada-plan.md): Marco quiere llegar a US$2,3 millones
 * en 2027 «entre facturación y comisiones». La barra pone, año por año, lo que se facturó con lo que haya en la base:
 *
 *  · Odoo: facturas publicadas menos notas de crédito, en la moneda del documento (`montoNeto`, sin IVA).
 *  · Mercury: facturas no canceladas (lo internacional, sin IVA).
 *  · Aliados: las comisiones con monto confirmado (no las estimadas), por su fecha.
 *
 * Los libros mandan (Odoo y Mercury, decisión del 16 oct): los cobros de Cobranza no se suman acá, porque son las MISMAS
 * facturas vistas desde otro lado y sumarlas contaría dos veces.
 *
 * ⛔ No convierte monedas: junta por moneda y fuente. Para dibujar la barra en dólares, quien llama le pasa `aDolares`,
 * que convierte con la tasa del mes (`convertir`, lib/finanzas/equilibrio.ts, el único punto) — y lo que no se pudo
 * convertir queda por moneda, dicho, nunca sumado a ojo.
 */
import type { CaminoALaMeta, LineaDePorFacturar } from "./por-facturar";

export type FuenteDeLaMeta = "odoo" | "mercury" | "aliados";

export const ETIQUETA_DE_LA_FUENTE: Record<FuenteDeLaMeta, string> = {
  odoo: "Odoo",
  mercury: "Mercury",
  aliados: "Comisiones de aliados",
};

export interface DocumentoParaLaMeta {
  fuente: FuenteDeLaMeta;
  /** «2026-03-24». */
  diaISO: string;
  moneda: string;
  /** Con signo: una nota de crédito resta. */
  monto: number;
}

export interface MontoDelMes {
  periodo: string;
  moneda: string;
  fuente: FuenteDeLaMeta;
  monto: number;
  documentos: number;
}

/** Lo facturado de cada mes, por moneda y fuente. Sin convertir. */
export function facturadoPorMes(docs: readonly DocumentoParaLaMeta[]): MontoDelMes[] {
  const m = new Map<string, MontoDelMes>();
  for (const d of docs) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(d.diaISO) || !Number.isFinite(d.monto)) continue;
    const periodo = d.diaISO.slice(0, 7);
    const k = `${periodo}|${d.moneda}|${d.fuente}`;
    const x = m.get(k) ?? { periodo, moneda: d.moneda, fuente: d.fuente, monto: 0, documentos: 0 };
    x.monto += d.monto;
    x.documentos++;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => a.periodo.localeCompare(b.periodo) || a.moneda.localeCompare(b.moneda) || a.fuente.localeCompare(b.fuente));
}

export interface AnioDeLaBarra {
  anio: number;
  /** Lo facturado por moneda y fuente, sin convertir. */
  porMoneda: Record<string, Partial<Record<FuenteDeLaMeta, number>>>;
  /** En dólares (la presentación), por fuente. Solo lo que se pudo convertir. */
  usdPorFuente: Record<FuenteDeLaMeta, number>;
  usd: number;
  /** Lo que no se pudo convertir (sin tasa ese mes), por moneda: existe, pero no está en `usd`. */
  sinConvertir: Record<string, number>;
  documentos: number;
  /** Los meses del año con algún documento. */
  meses: number;
  /** El año todavía no terminó. */
  enCurso: boolean;
}

/**
 * Los años, del primero con datos al de `hoyISO`, con lo facturado en dólares. Un año del medio sin datos sale con
 * `documentos: 0`: la pantalla lo dice («no hay facturas en la base»), no lo dibuja como un año en cero.
 */
export function aniosDeLaBarra(
  meses: readonly MontoDelMes[],
  hoyISO: string,
  aDolares: (monto: number, moneda: string, periodo: string) => number | null,
): AnioDeLaBarra[] {
  const actual = Number(hoyISO.slice(0, 4));
  const conDatos = meses.map((m) => Number(m.periodo.slice(0, 4))).filter((a) => a <= actual);
  if (!conDatos.length) return [];
  const primero = Math.min(...conDatos);
  const out: AnioDeLaBarra[] = [];
  for (let anio = primero; anio <= actual; anio++) {
    const delAnio = meses.filter((m) => m.periodo.startsWith(`${anio}-`));
    const a: AnioDeLaBarra = {
      anio,
      porMoneda: {},
      usdPorFuente: { odoo: 0, mercury: 0, aliados: 0 },
      usd: 0,
      sinConvertir: {},
      documentos: 0,
      meses: new Set(delAnio.map((m) => m.periodo)).size,
      enCurso: anio === actual,
    };
    for (const m of delAnio) {
      const pm = (a.porMoneda[m.moneda] ??= {});
      pm[m.fuente] = (pm[m.fuente] ?? 0) + m.monto;
      a.documentos += m.documentos;
      const usd = aDolares(m.monto, m.moneda, m.periodo);
      if (usd === null) a.sinConvertir[m.moneda] = (a.sinConvertir[m.moneda] ?? 0) + m.monto;
      else {
        a.usdPorFuente[m.fuente] += usd;
        a.usd += usd;
      }
    }
    out.push(a);
  }
  return out;
}

export interface MetaVigente {
  anio: number;
  montoUsd: number;
  nota: string | null;
  definidaPor: string;
  definidaAt: string;
}

/** La meta vigente de cada año: la última que se definió (las filas son append-only). */
export function metasVigentes(filas: readonly MetaVigente[]): Map<number, MetaVigente> {
  const out = new Map<number, MetaVigente>();
  for (const f of [...filas].sort((a, b) => a.definidaAt.localeCompare(b.definidaAt))) out.set(f.anio, f);
  return out;
}

export interface LecturaDeLaMeta {
  meta: MetaVigente;
  /** El último año COMPLETO con datos antes de la meta (contra el que se mide cuánto hay que crecer). */
  base: { anio: number; usd: number } | null;
  /** Cuánto hay que crecer contra la base: 1,8 = 180 % más. null sin base. */
  crecimiento: number | null;
  /** Lo que el año en curso lleva más lo que ya está programado para facturar, en dólares. */
  enCurso: { anio: number; facturado: number; porFacturar: number } | null;
  /** Lo que hace falta facturar por mes en el año de la meta. */
  porMes: number;
}

/** Cuánto falta: contra el último año completo, y lo que hay que facturar por mes en el año de la meta. */
export function leerLaMeta(anios: readonly AnioDeLaBarra[], meta: MetaVigente, porFacturarDelAnioEnCurso: number): LecturaDeLaMeta {
  const completos = anios.filter((a) => !a.enCurso && a.anio < meta.anio && a.documentos > 0);
  const ultimo = completos.at(-1) ?? null;
  const enCurso = anios.find((a) => a.enCurso) ?? null;
  return {
    meta,
    base: ultimo ? { anio: ultimo.anio, usd: ultimo.usd } : null,
    crecimiento: ultimo && ultimo.usd > 0 ? meta.montoUsd / ultimo.usd - 1 : null,
    enCurso: enCurso ? { anio: enCurso.anio, facturado: enCurso.usd, porFacturar: Math.max(0, porFacturarDelAnioEnCurso) } : null,
    porMes: meta.montoUsd / 12,
  };
}

export interface MetaYPorFacturar {
  hoyISO: string;
  anios: AnioDeLaBarra[];
  /** Todas las metas definidas, de la más vieja a la más nueva (la historia). */
  historial: MetaVigente[];
  /** La meta vigente del año más cercano que tiene una (de hoy en adelante). */
  meta: LecturaDeLaMeta | null;
  /** De qué está hecha la línea de «por facturar» del año en curso. null sin el reporte del año. */
  linea: LineaDePorFacturar | null;
  /** Con la recurrencia de hoy y el pipeline, cuánto falta para la meta. null sin meta. */
  camino: CaminoALaMeta | null;
  /** Lo que no se pudo convertir (sin tasa), por año y moneda: existe, pero no está en las barras. */
  sinConvertir: Array<{ anio: number; moneda: string; monto: number }>;
}
