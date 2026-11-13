/**
 * lib/cobranza/contratos.ts — los contratos recurrentes: inicio, fin y renovación, y los avisos a Customer Success
 * (2026-11-13). PURO y CLIENT-SAFE.
 *
 * ── EL CONTRATO ─────────────────────────────────────────────────────────────────
 * Un servicio RECURRENTE de Cobranza es un contrato: empieza en `fechaInicioFacturacion` y termina en `contratoFin`. Casi
 * ningún contrato dice su fin; sin él, el fin es el inicio más `duracionMeses`, y sin duración el contrato no tiene fin
 * (las suscripciones abiertas). La renovación dice qué pasa al vencer: se renueva solo, hay que renovarlo, o termina.
 * Nada de esto mueve las cuotas: el motor sigue leyendo `duracionMeses`.
 *
 * ── LOS DOS AVISOS ──────────────────────────────────────────────────────────────
 *  · Por vencer: a 30 días del fin (o ya vencido y todavía activo), a quien lleva la cuenta.
 *  · No avanza: un contrato activo en una cuenta sin contacto hace más de 21 días. NO es una métrica nueva: es
 *    `DIAS_SIN_CONTACTO` y el último contacto de la cartera de Customer Success (reuniones con el cliente o actividad en
 *    HubSpot, `ultimoContactoDeLaCuenta`), lo mismo que pinta la cuenta de «Fría».
 */
import { diffDays } from "./engine";

/** Cuántos días antes del fin se avisa. */
export const DIAS_AVISO_FIN_CONTRATO = 30;

export const RENOVACIONES = ["automatica", "manual", "no-renueva"] as const;
export type Renovacion = (typeof RENOVACIONES)[number];

export const NOMBRE_DE_LA_RENOVACION: Record<Renovacion, string> = {
  automatica: "Se renueva solo",
  manual: "Hay que renovarlo",
  "no-renueva": "No se renueva",
};

export const esRenovacion = (v: unknown): v is Renovacion => typeof v === "string" && (RENOVACIONES as readonly string[]).includes(v);

export interface ServicioParaContrato {
  modalidad: string;
  estado: string;
  /** AAAA-MM-DD. */
  fechaInicioFacturacion: string | null;
  duracionMeses: number | null;
  /** AAAA-MM-DD. */
  contratoFin: string | null;
  contratoRenovacion: string | null;
}

/** Suma meses a un día AAAA-MM-DD; si el mes no tiene ese día, el último del mes (31-ene + 1 = 28-feb). */
export function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** El fin del contrato (AAAA-MM-DD): el escrito, o el inicio más la duración. null = sin fin. */
export function finDelContrato(s: Pick<ServicioParaContrato, "fechaInicioFacturacion" | "duracionMeses" | "contratoFin">): string | null {
  if (s.contratoFin) return s.contratoFin.slice(0, 10);
  if (s.fechaInicioFacturacion && s.duracionMeses) return sumarMeses(s.fechaInicioFacturacion, s.duracionMeses);
  return null;
}

export type AvisoDeContrato =
  | { clave: "por-vencer"; fin: string; dias: number; renovacion: Renovacion | null }
  | { clave: "vencido"; fin: string; dias: number; renovacion: Renovacion | null };

/** ¿Hay que avisar por el fin de este contrato? Solo recurrentes activos con fin. */
export function avisoDeFin(s: ServicioParaContrato, hoy: string): AvisoDeContrato | null {
  if (s.modalidad !== "RECURRENTE" || s.estado !== "ACTIVO") return null;
  const fin = finDelContrato(s);
  if (!fin) return null;
  const renovacion = esRenovacion(s.contratoRenovacion) ? s.contratoRenovacion : null;
  const dias = diffDays(hoy, fin);
  if (dias < 0) return { clave: "vencido", fin, dias: -dias, renovacion };
  return dias <= DIAS_AVISO_FIN_CONTRATO ? { clave: "por-vencer", fin, dias, renovacion } : null;
}

const enDias = (n: number) => (n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);

/** Qué hacer, según la renovación. */
export function queHacerConElFin(a: AvisoDeContrato): string {
  if (a.clave === "vencido") {
    return a.renovacion === "automatica"
      ? "Se renovó solo: confirma con el cliente que sigue y avísale a Finanzas la fecha nueva."
      : "Venció y sigue activo en Cobranza: confirma con el cliente si renueva y avísale a Finanzas.";
  }
  switch (a.renovacion) {
    case "automatica":
      return "Se renueva solo: confirma con el cliente que sigue contento.";
    case "manual":
      return "Hay que renovarlo: conversa la renovación con el cliente.";
    case "no-renueva":
      return "No se renueva: prepara el cierre con el cliente.";
    default:
      return "Nadie dijo si se renueva: conversa con el cliente qué sigue.";
  }
}

/** «vence en 12 días (el 2026-12-01)» / «venció hace 3 días». */
export function cuandoVence(a: AvisoDeContrato): string {
  return a.clave === "vencido" ? `venció hace ${a.dias === 1 ? "1 día" : `${a.dias} días`}` : `vence ${enDias(a.dias)}`;
}
