/**
 * lib/cs/lectura-de-la-cuenta.ts — cómo está una cuenta en una línea: el color y hasta tres motivos (2026-10-16, fase 1.2
 * de docs/nexus-sistema-de-trabajo-plan.md). PURO.
 *
 * En lugar de alertas sueltas. Antes cada cuenta juntaba una alerta del vigía por día sobre lo mismo (150 abiertas el
 * 16 de octubre) y quien la abría tenía que leerlas todas para saber si la cuenta estaba bien. Ahora la cuenta tiene
 * UNA lectura: el color de Éxito del cliente (`saludDeLaCuenta`, con sus razones) y, después, lo que vio el vigía que el
 * color no dice todavía. Como mucho tres motivos; el resto se cuenta.
 *
 * El orden:
 *   1. las razones del color, como las ordena el color (lo que lo pinta de rojo primero);
 *   2. las alertas abiertas de riesgo que ninguna razón ya dice, la más grave y la más reciente primero.
 * Una queja o un retraso con la frase verificada ya es una razón: no se repite como alerta. Las sugerencias del vigía
 * (una oportunidad, una acción proactiva) no son motivos del color: se cuentan aparte.
 *
 * ⛔ Para el CSE (`sinPlata`): nada que hable de plata (facturas, montos, MRR, comisiones). El CSE ve la lectura de sus
 * cuentas, no el dinero de la cartera (lib/cs/adopcion-del-cse.ts).
 */
import { HABLA_DE_PLATA } from "./adopcion-del-cse";
import {
  NOMBRE_DE_LA_SALUD,
  quienCorrigio,
  type AlertaDeCuenta,
  type RazonDeSalud,
  type SaludConPorque,
  type SaludDeCuenta,
} from "./cartera-reglas";

/** Cuántos motivos, como mucho. */
export const MAX_MOTIVOS = 3;

export interface MotivoDeLaLectura {
  texto: string;
  /** La razón del vigía, si el motivo es una alerta. */
  detalle: string | null;
  /** true = pinta (o pintaría) de rojo. */
  roja: boolean;
  /** Lo dijo la IA (el vigía o la lectura de una reunión), no una regla de Nexus. */
  delAgente: boolean;
  /** La alerta de donde sale, para abrirla. */
  alertaId: string | null;
}

export interface LecturaDeLaCuenta {
  salud: SaludDeCuenta;
  /** «Riesgo alto», «Señales de riesgo»… */
  nombre: string;
  /** Una línea, la del punto del color. */
  porque: string;
  motivos: MotivoDeLaLectura[];
  /** Los motivos que no entraron en los tres. */
  mas: number;
  /** Las sugerencias abiertas del vigía (oportunidades, acciones): no son motivos del color. */
  sugerencias: number;
  /** Quién corrigió el color a mano, si lo corrigió. */
  corregidoPor: string | null;
}

/** Las categorías del vigía que son sugerencias, no riesgos. */
const SUGERENCIAS: ReadonlySet<string> = new Set(["EXPANSION_OPPORTUNITY", "PROACTIVE_ACTION", "OTHER"]);

/** Qué razones del color ya dicen lo que dice una alerta de esa categoría. */
const YA_LO_DICE: Partial<Record<string, readonly RazonDeSalud[]>> = {
  RENEWAL_RISK: ["renuevaEnRiesgo", "cancelacion"],
  CHURN_RISK: ["cancelacion"],
  ADOPTION_RISK: ["uso"],
  LICENSE_UNUSED: ["uso"],
  PROJECT_BLOCKED: ["bloqueado", "bloqueoPorMotivo"],
  TIMELINE_OVERDUE: ["atrasado", "retraso", "retrasoGrave"],
  ENGAGEMENT_COLD: ["fria", "sinContacto"],
  QUEJA: ["queja", "quejaGrave"],
};

/** Las razones que salen de lo que dijo el cliente, que la IA encontró y Nexus verificó. */
const RAZONES_DEL_AGENTE: ReadonlySet<RazonDeSalud> = new Set(["queja", "quejaGrave", "retraso", "retrasoGrave"]);

const RANGO: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };

export function lecturaDeLaCuenta(
  salud: SaludConPorque,
  alertas: readonly AlertaDeCuenta[],
  opciones: { sinPlata?: boolean } = {},
): LecturaDeLaCuenta {
  const conPlata = (t: string | null | undefined) => !!opciones.sinPlata && !!t && HABLA_DE_PLATA.test(t);
  const claves = new Set(salud.razones.map((r) => r.clave));

  const deLasRazones: MotivoDeLaLectura[] = salud.razones
    .filter((r) => !conPlata(r.texto))
    .map((r) => ({ texto: r.texto, detalle: null, roja: !!r.roja, delAgente: RAZONES_DEL_AGENTE.has(r.clave), alertaId: null }));

  const deLasAlertas: MotivoDeLaLectura[] = alertas
    .filter((a) => !SUGERENCIAS.has(a.categoria))
    // Con la frase verificada ya es una razón del color.
    .filter((a) => !a.cita)
    .filter((a) => !(YA_LO_DICE[a.categoria] ?? []).some((c) => claves.has(c)))
    .filter((a) => !conPlata(a.titulo))
    .sort((a, b) => (RANGO[b.severidad] ?? 0) - (RANGO[a.severidad] ?? 0) || b.detectadaEn.localeCompare(a.detectadaEn))
    .map((a) => ({
      texto: a.titulo,
      detalle: conPlata(a.razon) ? null : a.razon || null,
      roja: a.severidad === "HIGH",
      delAgente: a.delAgente,
      alertaId: a.id,
    }));

  const todos = [...deLasRazones, ...deLasAlertas];
  return {
    salud: salud.salud,
    nombre: NOMBRE_DE_LA_SALUD[salud.salud],
    porque: salud.porque,
    motivos: todos.slice(0, MAX_MOTIVOS),
    mas: Math.max(0, todos.length - MAX_MOTIVOS),
    sugerencias: alertas.filter((a) => SUGERENCIAS.has(a.categoria)).length,
    corregidoPor: salud.correccion ? quienCorrigio(salud.correccion) : null,
  };
}

/** La lectura pide atención hoy: la cuenta está en rojo. */
export function pideAtencion(l: Pick<LecturaDeLaCuenta, "salud">): boolean {
  return l.salud === "en-riesgo";
}
