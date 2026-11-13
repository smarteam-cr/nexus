/**
 * lib/cobranza/estado-de-pago.ts — cómo va el pago de UN proyecto, para Customer Success, y la regla de los 15 días
 * (2026-11-13). PURO y CLIENT-SAFE.
 *
 * ── LA REGLA DE LOS 15 DÍAS ─────────────────────────────────────────────────────
 * Si la PRIMERA cuota de un servicio no se paga en 15 días, Customer Success (quien lleva el proyecto) lo sabe para
 * pausar las sesiones o la implementación (Elías, 2026-11-13; casos reales: Cúprica y Construtecho). Los 15 días son el
 * crédito estándar (`DEFAULT_CREDITO_DIAS`) contado desde la factura: es el MISMO criterio único de «vencido» de Cobranza
 * (DECISIONS «Cobranza — criterio ÚNICO de "vencido"»), no uno nuevo. Una cuenta con otro crédito usa el suyo. Una cuota
 * que todavía no se facturó no cuenta: ahí el atraso es nuestro, no del cliente.
 *
 * ── DE QUÉ PROYECTO ES UN SERVICIO ──────────────────────────────────────────────
 * El del servicio (`ServicioContratado.projectId`). Los servicios sin proyecto (los del libro de Alex, los creados a mano)
 * son de la cuenta: cuentan en todos sus proyectos, como en el aviso de proyecto pausado (lib/cobranza/proyecto-pausado.ts).
 *
 * ⛔ Sin montos: lo lee el CSE, que no ve la plata de la cartera (lib/para-ti/fuentes/tus-cuentas.ts). Dice qué
 * conversación hay que tener, no cuánto se debe.
 */
import { DEFAULT_CREDITO_DIAS, addDaysISO, diffDays, semaforoCobro } from "./engine";

export interface CobroParaEstado {
  numCuota: number | null;
  estado: string;
  /** AAAA-MM-DD. */
  fechaProgramada: string;
  fechaEmision: string | null;
  fechaCobro: string | null;
}

export interface ServicioParaEstado {
  id: string;
  /** Cómo se nombra: la descripción o el tipo. */
  nombre: string;
  projectId: string | null;
  estado: string;
  /** El de la cuenta. null = el estándar. */
  creditoDias: number | null;
  cobros: CobroParaEstado[];
}

export type EstadoDePago =
  /** El proyecto no tiene nada cargado en Cobranza. */
  | { clave: "sin-cobranza" }
  | { clave: "al-dia"; ultimoPago: string | null }
  | { clave: "vencido"; cuotas: number; diasMax: number }
  /** La regla de los 15 días: la primera cuota de un servicio sigue sin pagarse. */
  | { clave: "primera-sin-pagar"; servicio: string; dias: number; cuotas: number; diasMax: number };

/** La primera cuota de un servicio: la de menor número, o la más vieja si no tienen número. */
export function primeraCuota<C extends CobroParaEstado>(cobros: readonly C[]): C | null {
  if (cobros.length === 0) return null;
  return [...cobros].sort(
    (a, b) =>
      (a.numCuota ?? Number.MAX_SAFE_INTEGER) - (b.numCuota ?? Number.MAX_SAFE_INTEGER) ||
      a.fechaProgramada.localeCompare(b.fechaProgramada),
  )[0];
}

/** Cuántos días lleva vencida la primera cuota del servicio. null = no aplica (pagada, sin factura o en plazo). */
export function primeraCuotaVencida(s: Pick<ServicioParaEstado, "cobros" | "creditoDias">, hoy: string): number | null {
  const p = primeraCuota(s.cobros);
  if (!p || p.estado === "COBRADO" || !p.fechaEmision) return null;
  const dias = diffDays(addDaysISO(p.fechaEmision, s.creditoDias ?? DEFAULT_CREDITO_DIAS), hoy);
  return dias > 0 ? dias : null;
}

/** Los servicios que cuentan para un proyecto: los suyos y los de la cuenta sin proyecto. Los finalizados no. */
export function serviciosDelProyecto<S extends Pick<ServicioParaEstado, "projectId" | "estado">>(
  projectId: string,
  servicios: readonly S[],
): S[] {
  return servicios.filter((s) => s.estado !== "FINALIZADO" && (s.projectId === projectId || s.projectId === null));
}

export function estadoDePago(servicios: readonly ServicioParaEstado[], hoy: string): EstadoDePago {
  const conCobros = servicios.filter((s) => s.cobros.length > 0);
  if (conCobros.length === 0) return { clave: "sin-cobranza" };
  let cuotas = 0;
  let diasMax = 0;
  let ultimoPago: string | null = null;
  let primera: { servicio: string; dias: number } | null = null;
  for (const s of conCobros) {
    const credito = s.creditoDias ?? DEFAULT_CREDITO_DIAS;
    for (const c of s.cobros) {
      if (c.estado === "COBRADO") {
        if (c.fechaCobro && (!ultimoPago || c.fechaCobro > ultimoPago)) ultimoPago = c.fechaCobro;
        continue;
      }
      if (c.fechaEmision && semaforoCobro({ estado: c.estado, fechaProgramadaISO: c.fechaProgramada, fechaEmisionISO: c.fechaEmision }, hoy, credito) === "rojo") {
        cuotas++;
        diasMax = Math.max(diasMax, diffDays(addDaysISO(c.fechaEmision, credito), hoy));
      }
    }
    const dias = primeraCuotaVencida(s, hoy);
    if (dias !== null && (!primera || dias > primera.dias)) primera = { servicio: s.nombre, dias };
  }
  if (primera) return { clave: "primera-sin-pagar", servicio: primera.servicio, dias: primera.dias, cuotas, diasMax };
  if (cuotas > 0) return { clave: "vencido", cuotas, diasMax };
  return { clave: "al-dia", ultimoPago };
}

const dias = (n: number) => (n === 1 ? "1 día" : `${n} días`);

/** La frase para la ficha. null = no hay nada que decir (sin cobranza). */
export function textoDelEstado(e: EstadoDePago): { titulo: string; detalle: string | null; tono: "ok" | "warn" | "danger" } | null {
  switch (e.clave) {
    case "sin-cobranza":
      return null;
    case "al-dia":
      return { titulo: "Pagos al día", detalle: null, tono: "ok" };
    case "vencido":
      return {
        titulo: e.cuotas === 1 ? "Tiene una cuota vencida" : `Tiene ${e.cuotas} cuotas vencidas`,
        detalle: `La más vieja venció hace ${dias(e.diasMax)}. Finanzas ya la está cobrando.`,
        tono: "warn",
      };
    case "primera-sin-pagar":
      return {
        titulo: `La primera cuota de «${e.servicio}» lleva ${dias(e.dias)} vencida`,
        detalle: "Habla con tu líder para pausar las sesiones o la implementación hasta que pague.",
        tono: "danger",
      };
  }
}
