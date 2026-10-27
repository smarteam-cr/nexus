/**
 * lib/tareas/aligerar.ts — menos tareas a la vista, sin perder ninguna. CLIENT-SAFE y puro.
 *
 * Elías y Alex Vanegas (2026-10-19): cada CSE ve unas 20 tareas y es difícil de llevar. Medido ese día
 * (scripts/medir-tareas-por-persona.ts): casi todo son propuestas de las reuniones, muchas son RÁPIDAS (enviar una
 * invitación, recordarle algo al cliente) y varias hablan de una fecha que ya pasó. Tres reglas, ninguna cambia un dato
 * sola (DECISIONS «Tareas internas…» › «Menos tareas a la vista»):
 *
 *  1. `claseDeTrabajo`: una tarea es TRABAJO, RÁPIDA (se hace en minutos: enviar, compartir, agendar) o SEGUIMIENTO
 *     (empujar al cliente: recordarle, confirmar con, retomar). Lo rápido y el seguimiento se ven aparte y plegados.
 *  2. `agruparRapidas`: lo rápido de una misma cuenta va en UN renglón («Rápidas con Tecnosagot · 3»). Es solo la
 *     vista: las tareas siguen siendo una por una, cada una con su casilla.
 *  3. `sugerenciaDeCierre`: lo que ya pasó y nadie tocó se PROPONE cerrar («Ya no se hará» con el motivo escrito, o
 *     «Descartar» si era una propuesta). Lo confirma una persona; nada se cierra solo.
 *
 * Una tarea de HubSpot nunca se propone cerrar: «Ya no se hará» no existe allá (lib/tareas-hubspot) y quedaría abierta
 * en HubSpot.
 */
import { esCandidataClara, normalizar } from "./texto";
import { diaCortoConSemana } from "./semana";

export type ClaseDeTrabajo = "trabajo" | "rapida" | "seguimiento";

export const NOMBRE_DE_LA_CLASE: Record<ClaseDeTrabajo, string> = {
  trabajo: "Trabajo",
  rapida: "Rápida",
  seguimiento: "Seguimiento",
};

/** Empujar al cliente o a alguien de afuera: lo que se hace con un mensaje. Comparado al INICIO del título, normalizado. */
const VERBOS_DE_SEGUIMIENTO = [
  "recordarle",
  "recordarles",
  "recordar a",
  "dar seguimiento",
  "darle seguimiento",
  "hacer seguimiento",
  "seguimiento",
  "verificar con",
  "confirmar con",
  "preguntarle",
  "preguntar a",
  "retomar",
  "seguirle",
  "volver a contactar",
  "volver a escribir",
  "reagendar",
  "insistir",
  "pedirle",
  "solicitarle",
];

/** Lo que se hace en minutos. Comparado al INICIO del título, normalizado. */
const VERBOS_RAPIDOS = [
  "enviar",
  "enviarle",
  "reenviar",
  "mandar",
  "mandarle",
  "compartir",
  "compartirle",
  "agendar",
  "invitar",
  "avisar",
  "avisarle",
  "notificar",
  "confirmar",
  "confirmarle",
  "responder",
  "responderle",
  "escribir",
  "escribirle",
  "llamar",
  "llamarle",
  "programar la reunion",
  "programar una reunion",
];

/**
 * Palabras que dicen que hay TRABAJO detrás aunque empiece con un verbo rápido: «Enviar la propuesta económica con el
 * costo de implementación» pide armarla antes. Ante la duda, es trabajo (se ve entero).
 */
const SENALES_DE_TRABAJO = [
  "propuesta",
  "cotizacion",
  "informe",
  "reporte",
  "diagnostico",
  "plan ",
  "plan de",
  "guia",
  "configurar",
  "configuracion",
  "crear",
  "preparar",
  "construir",
  "disenar",
  "desarrollar",
  "implementar",
  "migrar",
  "integrar",
  "documento madre",
];

/** Una tarea que dura esto o menos (estimada a mano) es rápida aunque el título no lo diga. */
export const MINUTOS_DE_UNA_RAPIDA = 15;

const empiezaCon = (n: string, verbos: readonly string[]) => verbos.some((v) => n === v || n.startsWith(`${v} `));

/** ¿Trabajo, rápida o seguimiento? Solo por el título (y la estimación). Nunca cambia la tarea: decide cómo se ve. */
export function claseDeTrabajo(t: { titulo: string; minutosEstimados?: number | null }): ClaseDeTrabajo {
  const n = normalizar(t.titulo);
  const conTrabajo = SENALES_DE_TRABAJO.some((s) => ` ${n} `.includes(` ${s}`));
  if (empiezaCon(n, VERBOS_DE_SEGUIMIENTO)) return "seguimiento";
  if (!conTrabajo && empiezaCon(n, VERBOS_RAPIDOS)) return "rapida";
  if (!conTrabajo && t.minutosEstimados != null && t.minutosEstimados > 0 && t.minutosEstimados <= MINUTOS_DE_UNA_RAPIDA) return "rapida";
  return "trabajo";
}

export const esLigera = (t: { titulo: string; minutosEstimados?: number | null }) => claseDeTrabajo(t) !== "trabajo";

/* ── Agrupar lo rápido de una cuenta ──────────────────────────────────────────────── */

export interface GrupoDeRapidas<T> {
  /** El id de la cuenta, o "" sin cuenta. */
  clave: string;
  cuenta: string | null;
  tareas: T[];
}

export interface ListaAligerada<T> {
  /** Lo que se ve entero, en el orden en que llegó. */
  trabajo: T[];
  /** Lo rápido y los seguimientos, por cuenta: la cuenta con más primero, «sin cuenta» al final. */
  ligeras: GrupoDeRapidas<T>[];
  /** Cuántas ligeras en total. */
  cuantasLigeras: number;
}

/**
 * Separa lo rápido del trabajo y junta lo rápido por cuenta. Con `minimo` ligeras o menos en toda la lista no separa
 * nada (dos tareas sueltas no necesitan un pliegue).
 */
export function agruparRapidas<T extends { titulo: string; minutosEstimados?: number | null; cliente: { id: string; nombre: string } | null }>(
  lista: readonly T[],
  minimo = 2,
): ListaAligerada<T> {
  const ligeras = lista.filter(esLigera);
  if (ligeras.length < minimo) return { trabajo: [...lista], ligeras: [], cuantasLigeras: 0 };
  const grupos = new Map<string, GrupoDeRapidas<T>>();
  for (const t of ligeras) {
    const clave = t.cliente?.id ?? "";
    const g = grupos.get(clave) ?? { clave, cuenta: t.cliente?.nombre ?? null, tareas: [] };
    g.tareas.push(t);
    grupos.set(clave, g);
  }
  const orden = [...grupos.values()].sort((a, b) => (a.clave === "") !== (b.clave === "") ? (a.clave === "" ? 1 : -1) : b.tareas.length - a.tareas.length || (a.cuenta ?? "").localeCompare(b.cuenta ?? ""));
  return { trabajo: lista.filter((t) => !esLigera(t)), ligeras: orden, cuantasLigeras: ligeras.length };
}

/* ── Mismo tema en la misma cuenta (para medir) ───────────────────────────────────── */

/**
 * Las tareas que repiten el mismo tema en la misma cuenta: grupos de 2 o más con un título claramente parecido
 * (`esCandidataClara`, la regla de «¿Es T-12?») y el mismo cliente. Sin cliente no se compara (podría ser cualquiera).
 */
export function temasRepetidos<T extends { titulo: string; clientId: string | null }>(lista: readonly T[]): T[][] {
  const grupos: T[][] = [];
  const usadas = new Set<T>();
  for (const a of lista) {
    if (!a.clientId || usadas.has(a)) continue;
    const g = [a];
    for (const b of lista) {
      if (b === a || usadas.has(b) || b.clientId !== a.clientId) continue;
      if (esCandidataClara(a.titulo, b.titulo)) g.push(b);
    }
    if (g.length >= 2) {
      for (const x of g) usadas.add(x);
      grupos.push(g);
    }
  }
  return grupos;
}

/* ── Lo que ya pasó: proponer cerrarlo ────────────────────────────────────────────── */

/** Una tarea RÁPIDA (propuesta o abierta) cuya fecha pasó hace estos días o más ya habla de algo que no fue. */
export const DIAS_FECHA_PASADA = 3;
/**
 * Un SEGUIMIENTO cuya fecha pasó hace estos días o más sin que nadie lo tocara. Más que una rápida: que el cliente se
 * atrase es justo cuando hay que empujar; una semana después sin que nadie lo hiciera, ya pasó o ya no importa.
 */
export const DIAS_SEGUIMIENTO_PASADO = 7;
/** Una tarea de trabajo abierta vencida hace estos días o más, sin que nadie la toque en ese tiempo. */
export const DIAS_ABIERTA_VENCIDA = 14;
/** Una tarea abierta de una semana que pasó hace estos días o más (sin vencimiento), sin que nadie la toque. */
export const DIAS_SEMANA_VIEJA = 21;
/** Una tarea sin semana ni fecha («Por asignar», «Más adelante») que nadie tocó en estos días. */
export const DIAS_SIN_TOMAR = 28;

export interface SugerenciaDeCierre {
  /** `no_se_hara` para una abierta; `descartar` para una propuesta (la decide su dueño). */
  accion: "no_se_hara" | "descartar";
  /** Lo que se escribe como motivo si la persona la cierra. */
  motivo: string;
  /** Lo que ve la persona en la fila («Era para el jue 15 oct»). */
  porQue: string;
}

export interface TareaParaCerrar {
  titulo: string;
  minutosEstimados?: number | null;
  estado: string;
  origen: string;
  venceEl: string | null;
  semana: string | null;
  creadaAt: string;
  /** La última vez que una PERSONA hizo algo con ella (un evento que no es de Nexus, del sistema ni de HubSpot). */
  ultimoToque: string | null;
  /** Tiene su tarea en HubSpot (vino de allá o es un seguimiento comercial que se creó allá, D4). */
  enHubspot?: boolean;
}

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta.slice(0, 10)}T12:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
const enDias = (n: number) => (n === 1 ? "1 día" : `${n} días`);

/**
 * ¿Conviene proponer cerrarla? `hoy` en hora CR (AAAA-MM-DD). Nunca una de HubSpot ni una cerrada.
 *  · Una RÁPIDA («Enviar la invitación para la reunión del jueves 15»), propuesta o abierta, cuya fecha pasó hace 3
 *    días o más, o un SEGUIMIENTO («Recordarle a Sonia que envíe hoy mismo…») cuya fecha pasó hace 7, y que ninguna
 *    persona tocó desde esa fecha: ya habla de algo que no fue. Una de TRABAJO con la fecha pasada no: está atrasada,
 *    pero el trabajo sigue haciendo falta (una propuesta de trabajo la vence el job del lunes a los 14 días).
 *  · Una abierta de trabajo vencida hace 14 días o más, sin que nadie la toque en 14 días.
 *  · Una abierta sin fecha de una semana de hace 21 días o más, sin que nadie la toque en 21 días.
 *  · Una abierta sin semana ni fecha («Por asignar», «Más adelante») que nadie tocó en 28 días desde que nació.
 * El job del lunes ya vence las propuestas de 14 días sin mirar fechas; esto llega antes, y pregunta.
 */
export function sugerenciaDeCierre(t: TareaParaCerrar, hoy: string): SugerenciaDeCierre | null {
  if (t.origen === "hubspot" || t.enHubspot) return null;
  const propuesta = t.estado === "propuesta";
  if (!propuesta && t.estado !== "pendiente" && t.estado !== "en_curso") return null;
  const clase = claseDeTrabajo(t);
  // La última señal de vida: lo que hizo una persona, o cuándo nació.
  const vida = t.ultimoToque ?? t.creadaAt;
  const sinTocar = diasEntre(vida, hoy);

  if (t.venceEl && clase !== "trabajo") {
    const pasaron = diasEntre(t.venceEl, hoy);
    const umbral = clase === "rapida" ? DIAS_FECHA_PASADA : DIAS_SEGUIMIENTO_PASADO;
    // Alguien la tocó después de su fecha: la está mirando.
    if (pasaron < umbral || (t.ultimoToque && diasEntre(t.venceEl, t.ultimoToque) > 0)) return null;
    const dia = diaCortoConSemana(t.venceEl.slice(0, 10));
    return {
      accion: propuesta ? "descartar" : "no_se_hara",
      motivo: `Ya pasó: era para el ${dia} y nadie la ${propuesta ? "decidió" : "tocó"} desde entonces.`,
      porQue: `Era para el ${dia}`,
    };
  }
  if (propuesta) return null;
  if (t.venceEl) {
    const pasaron = diasEntre(t.venceEl, hoy);
    if (pasaron < DIAS_ABIERTA_VENCIDA || sinTocar < DIAS_ABIERTA_VENCIDA) return null;
    return {
      accion: "no_se_hara",
      motivo: `Venció el ${diaCortoConSemana(t.venceEl.slice(0, 10))} y nadie la tocó en ${enDias(sinTocar)}.`,
      porQue: `Venció hace ${enDias(pasaron)}`,
    };
  }
  if (t.semana) {
    const desdeLaSemana = diasEntre(t.semana, hoy);
    if (desdeLaSemana < DIAS_SEMANA_VIEJA || sinTocar < DIAS_SEMANA_VIEJA) return null;
    return {
      accion: "no_se_hara",
      motivo: `Era de la semana del ${diaCortoConSemana(t.semana.slice(0, 10))} y nadie la tocó en ${enDias(sinTocar)}.`,
      porQue: `${Math.floor(sinTocar / 7)} semanas sin tocar`,
    };
  }
  if (sinTocar < DIAS_SIN_TOMAR) return null;
  return {
    accion: "no_se_hara",
    motivo: `Nadie la tomó en ${enDias(sinTocar)}.`,
    porQue: `${Math.floor(sinTocar / 7)} semanas sin que nadie la tome`,
  };
}

/* ── La limpieza de «Por decidir» (roadmap D2 etapa 1) ────────────────────────────── */

export interface SugerenciaSinDecidir {
  id: string;
  responsableEmail: string;
  venceEl: string | null;
  creadaAt: string;
  numero: number;
  /** Salió de la reunión del sprint (lib/tareas/sprint.ts): no cuenta para el tope ni lo vence el tope. */
  delSprint?: boolean;
}

export interface SugerenciaQueVence {
  id: string;
  /** `fecha`: su fecha ya pasó. `tope`: la persona tiene más de las que caben (quedan las más nuevas). */
  regla: "fecha" | "tope";
  motivo: string;
}

/**
 * Qué sugerencias de Nexus (sin decidir y sin que nadie las tocara: lo filtra quien llama) vence la limpieza
 * (2026-10-27). `hoy` en hora CR (AAAA-MM-DD). Dos reglas, en este orden:
 *  · su fecha pasó (antes de hoy): habla de algo que ya fue, sea rápida, seguimiento o trabajo. Una propuesta no es
 *    trabajo de nadie todavía, así que no hay nada «atrasado» que cuidar (a diferencia de una abierta: `sugerenciaDeCierre`);
 *  · de lo que queda, a cada persona le quedan sus `tope` más nuevas (la misma regla que `podarSugerencias`). Lo que
 *    salió de la reunión del sprint no cuenta ni lo vence el tope (2026-10-27, Elías): es trabajo acordado.
 */
export function limpiezaDePorDecidir(filas: readonly SugerenciaSinDecidir[], hoy: string, tope: number): SugerenciaQueVence[] {
  const salida: SugerenciaQueVence[] = [];
  const quedan: SugerenciaSinDecidir[] = [];
  for (const f of filas) {
    if (f.venceEl && f.venceEl.slice(0, 10) < hoy) {
      salida.push({ id: f.id, regla: "fecha", motivo: `Su fecha (${diaCortoConSemana(f.venceEl.slice(0, 10))}) pasó sin que nadie la decidiera.` });
    } else if (!f.delSprint) quedan.push(f);
  }
  const porPersona = new Map<string, SugerenciaSinDecidir[]>();
  for (const f of quedan) {
    const k = f.responsableEmail.toLowerCase();
    porPersona.set(k, [...(porPersona.get(k) ?? []), f]);
  }
  for (const lista of porPersona.values()) {
    const orden = [...lista].sort((a, b) => b.creadaAt.localeCompare(a.creadaAt) || b.numero - a.numero);
    for (const f of orden.slice(tope)) {
      salida.push({ id: f.id, regla: "tope", motivo: `Había más de ${tope} sugerencias de las reuniones sin decidir: quedaron las más nuevas.` });
    }
  }
  return salida;
}
