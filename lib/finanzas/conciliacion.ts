/**
 * lib/finanzas/conciliacion.ts — Finanzas › Conciliación: lo que no cuadra con Odoo y con Mercury en UNA lista
 * (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md).
 *
 * Las dos listas ya hablan el mismo contrato (`DiferenciaOdoo`): las de Mercury se distinguen por el prefijo `MERCURY-`
 * de su código. Juntarlas es ordenarlas una sola vez y saber de dónde viene cada línea, para mandar cada «Está bien así»
 * a su ruta.
 *
 * ── QUIÉN LA TRABAJA ────────────────────────────────────────────────────────────
 * Una línea que «falta un dato de negocio» (`donde: PREGUNTANDO`) es una DECISIÓN: no se arregla registrando, la toma
 * quien supervisa («¿entró esta plata?», «¿es venta?»). Todas las demás las trabaja quien registra.
 *
 * PURO: sin Prisma ni red.
 */
import { resumenDeDiferencias, type DiferenciaOdoo, type ItemDiferencia, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";

export type FuenteDeLinea = "odoo" | "mercury";
export type FiltroFuente = "todas" | FuenteDeLinea;
/** «mias» = las que se arreglan registrando; «decisiones» = las que decide quien supervisa. */
export type FiltroQuien = "todas" | "mias" | "decisiones";

/** De dónde viene una línea: las de Mercury llevan el prefijo en su código. */
export function fuenteDeLinea(codigo: string): FuenteDeLinea {
  return codigo.startsWith("MERCURY-") ? "mercury" : "odoo";
}

/** ¿La línea es una decisión de negocio (la toma quien supervisa) y no algo que se arregla registrando? */
export function esDecision(l: Pick<DiferenciaOdoo, "donde">): boolean {
  return l.donde === "PREGUNTANDO";
}

const SEVERIDAD: Readonly<Record<string, number>> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

/**
 * Las dos listas en una, en el orden en que se trabajan: primero lo que tiene filas pendientes, después lo más grave y,
 * a igual gravedad, lo que mueve más plata. Cada lista ya viene ordenada así; esto solo las intercala.
 */
export function juntarDiferencias(odoo: readonly DiferenciaOdoo[], mercury: readonly DiferenciaOdoo[]): DiferenciaOdoo[] {
  return [...odoo, ...mercury].sort(
    (a, b) =>
      Number(a.items.length === 0) - Number(b.items.length === 0) ||
      (SEVERIDAD[a.severidad] ?? 9) - (SEVERIDAD[b.severidad] ?? 9) ||
      (b.montoEnJuego ?? 0) - (a.montoEnJuego ?? 0),
  );
}

/** Las líneas que pasan los dos filtros de la pantalla. */
export function filtrarDiferencias(
  lineas: readonly DiferenciaOdoo[],
  filtro: { fuente: FiltroFuente; quien: FiltroQuien },
): DiferenciaOdoo[] {
  return lineas.filter(
    (l) =>
      (filtro.fuente === "todas" || fuenteDeLinea(l.codigo) === filtro.fuente) &&
      (filtro.quien === "todas" || (filtro.quien === "decisiones") === esDecision(l)),
  );
}

/** Cuántas FILAS pendientes hay de cada lado: lo que se trabaja registrando y lo que espera una decisión. */
export function filasPorQuien(lineas: readonly DiferenciaOdoo[]): { mias: number; decisiones: number } {
  let mias = 0;
  let decisiones = 0;
  for (const l of lineas) {
    if (esDecision(l)) decisiones += l.items.length;
    else mias += l.items.length;
  }
  return { mias, decisiones };
}

/* ── Los grupos de «Lo que no cuadra» (rediseño 2026-10-22) ─────────────────────────────────────────────────────

Revisando la pestaña con Elías (2026-10-21): 156 filas en 20 líneas, ordenadas por gravedad, no decían por dónde
empezar. El diseño (Claude Design, «Lo que no cuadra · Conciliación») las junta en cuatro grupos según QUÉ TOCAN en
Nexus, más la historia:
  1 · COBRADO   — plata que ya entró y Nexus da por cobrar: mueve Cobranza, las alertas, el equilibrio y comisiones.
                  Se suman las filas de otras líneas que hablan de los mismos documentos (Fundauna era 4 filas en 4
                  listas: número sin documento ×2, monto distinto y por cobrar con la factura pagada).
  2 · NO_VE     — facturado que Nexus no ve: facturas sin cuenta o sin cuota.
  3 · PREGUNTAR — no se arregla tecleando: una venta contada dos veces, plata que entró sin factura.
  4 · PAPELES   — no mueve plata hoy, pero el día que el cliente pague no se cobra sola.
  HISTORIA      — sin efecto hoy: pagos sin conciliar de años pasados, monedas ya corregidas, facturas de antes de que
                  Nexus tuviera la cuenta. Plegada. */

export type GrupoDeConciliacion = "COBRADO" | "NO_VE" | "PREGUNTAR" | "PAPELES" | "HISTORIA";

export const ORDEN_DE_GRUPOS: readonly GrupoDeConciliacion[] = ["COBRADO", "NO_VE", "PREGUNTAR", "PAPELES", "HISTORIA"];

/** El grupo de cada línea. Una línea que no está acá cae por su `donde`: PREGUNTANDO → PREGUNTAR, lo demás → PAPELES. */
export const GRUPO_DE_LA_LINEA: Readonly<Record<string, GrupoDeConciliacion>> = {
  "ODOO-POR-COBRAR-PAGADA": "COBRADO",
  "MERCURY-PAGADA-SIN-COBRAR": "COBRADO",
  "ODOO-SIN-CUENTA": "NO_VE",
  "ODOO-FACTURA-SIN-COBRO": "NO_VE",
  "MERCURY-SIN-CUENTA": "NO_VE",
  "MERCURY-FACTURA-SIN-COBRO": "NO_VE",
  "MERCURY-CUENTA-SIN-CLIENTE": "NO_VE",
  "VENTA-CONTADA-DOS-VECES": "PREGUNTAR",
  "MERCURY-ENTRADA-SIN-FACTURA": "PREGUNTAR",
  "ODOO-IN-PAYMENT": "HISTORIA",
  "ODOO-MONEDA-CORREGIDA": "HISTORIA",
  "ODOO-EXENTAS": "HISTORIA",
};

export function grupoDeLaLinea(l: Pick<DiferenciaOdoo, "codigo" | "donde">): GrupoDeConciliacion {
  return GRUPO_DE_LA_LINEA[l.codigo] ?? (l.donde === "PREGUNTANDO" ? "PREGUNTAR" : "PAPELES");
}

export interface GrupoArmado {
  grupo: GrupoDeConciliacion;
  /** Las líneas del grupo, cada una con SOLO sus filas de este grupo (y su plata recortada a esas filas). */
  lineas: DiferenciaOdoo[];
  filas: number;
  /** La plata del grupo por moneda, cada documento una vez. */
  plata: MontoEnMoneda[];
}

const clavesDe = (it: ItemDiferencia) => [it.fila.clave, ...it.fila.documentos.map((d) => d.clave)];

/** Una línea recortada a algunas de sus filas: la plata, solo la de los documentos de esas filas. */
function recortar(l: DiferenciaOdoo, items: ItemDiferencia[]): DiferenciaOdoo {
  if (items.length === l.items.length) return l;
  const docs = new Set(items.flatMap(clavesDe));
  const plata = l.plata.filter((p) => docs.has(p.clave) || (p.clave.startsWith("m:") && docs.has(`f:${p.clave.slice(2)}`)));
  const montos = new Map<string, number>();
  for (const p of plata) montos.set(p.moneda, (montos.get(p.moneda) ?? 0) + p.monto);
  return {
    ...l,
    items,
    plata,
    montos: [...montos].map(([moneda, monto]) => ({ moneda, monto: Math.round(monto * 100) / 100 })),
  };
}

/**
 * Reparte las filas pendientes en los cinco grupos, en orden. Una fila va a COBRADO si su línea es de ese grupo o si
 * nombra un documento de una fila que lo es; a HISTORIA si es una factura de antes de la cuenta; si no, al de su línea.
 */
export function agruparDiferencias(lineas: readonly DiferenciaOdoo[]): GrupoArmado[] {
  const abiertas = lineas.filter((l) => l.items.length > 0);
  const deCobrado = new Set(
    abiertas.filter((l) => grupoDeLaLinea(l) === "COBRADO").flatMap((l) => l.items.flatMap((it) => it.fila.documentos.map((d) => d.clave))),
  );
  const grupoDeLaFila = (l: DiferenciaOdoo, it: ItemDiferencia): GrupoDeConciliacion => {
    const g = grupoDeLaLinea(l);
    if (g === "COBRADO" || g === "HISTORIA") return g;
    if (it.fila.documentos.some((d) => deCobrado.has(d.clave))) return "COBRADO";
    if (it.antesDeLaCuenta) return "HISTORIA";
    return g;
  };
  const porGrupo = new Map<GrupoDeConciliacion, DiferenciaOdoo[]>(ORDEN_DE_GRUPOS.map((g) => [g, []]));
  for (const l of abiertas) {
    const reparto = new Map<GrupoDeConciliacion, ItemDiferencia[]>();
    for (const it of l.items) {
      const g = grupoDeLaFila(l, it);
      reparto.set(g, [...(reparto.get(g) ?? []), it]);
    }
    for (const [g, items] of reparto) porGrupo.get(g)!.push(recortar(l, items));
  }
  return ORDEN_DE_GRUPOS.map((grupo) => {
    const ls = porGrupo.get(grupo)!;
    const r = resumenDeDiferencias(ls);
    return { grupo, lineas: ls, filas: r.filas, plata: r.plata };
  });
}
