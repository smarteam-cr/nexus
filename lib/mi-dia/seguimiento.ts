/**
 * lib/mi-dia/seguimiento.ts — «Seguimiento de cuentas» de Éxito del cliente (2026-10-19). PURO y client-safe.
 *
 * Una fila por cuenta de la cartera de Customer Success con lo que un CSE necesita para no perder el hilo:
 *   · la PRÓXIMA SESIÓN: la próxima reunión con la cuenta en los próximos `DIAS_PARA_LA_PROXIMA_SESION` días (del
 *     calendario de quien la lleva, de UNA empresa, o planeada en Tareas). Es más larga que la ventana de la regla de
 *     servicio (8 días): una cuenta con su reunión mensual en tres semanas sí tiene sesión agendada;
 *   · el SIGUIENTE PASO: el de la regla única (lib/mi-dia/servicio.ts › siguientePasoDeLaCuenta), tal como lo calcula la
 *     cartera de «Para ti». Acá no se recalcula;
 *   · los TEMAS que se están tratando: de 2 a 4, de lo que Nexus ya tiene, sin IA nueva al cargar (`elegirTemas`);
 *   · la ÚLTIMA REUNIÓN con el cliente (sin las de puertas adentro) y el CSE.
 *
 * Por qué vive en lib/mi-dia y no en lib/cs: se arma sobre la cartera de Customer Success de «Para ti»
 * (lib/mi-dia/cartera-cs.ts) y la regla de servicio, que viven acá; y lib/cs no puede leer Tareas más que por la puerta
 * de los agentes (lib/tareas/guardas.test.ts).
 */
import { mismoTema, temaDeLaTarea } from "@/lib/tareas/tema";
import { ORDEN_DE_SALUD, type PasoDeLaEmpresa, type SaludDeCs } from "./cartera-cs";
import { DIAS_PARA_LA_REUNION } from "./constantes";

/** Cuántos días hacia adelante se busca la próxima sesión con la cuenta. */
export const DIAS_PARA_LA_PROXIMA_SESION = 30;
/** Cuántos días hacia atrás se miran las reuniones con el cliente (la última reunión y sus temas). */
export const DIAS_DE_REUNIONES = 90;
/** Las reuniones de las que salen temas: las de los últimos 60 días, como mucho las 3 más recientes. */
export const DIAS_DE_TEMAS = 60;
export const REUNIONES_PARA_TEMAS = 3;
/** Los correos y llamadas de HubSpot de los que salen temas: los de los últimos 30 días. */
export const DIAS_DE_CORREOS = 30;
/** Cuántos temas se muestran por cuenta. Menos de `MIN_TEMAS` de las reuniones y los correos: se completan con tareas. */
export const MAX_TEMAS = 4;
export const MIN_TEMAS = 2;
/** El largo máximo de un tema en la fila (el texto completo va en el `title`). */
export const LARGO_DE_UN_TEMA = 90;

const DIA_MS = 86_400_000;

// ── Temas ─────────────────────────────────────────────────────────────────────────────────────

export type OrigenDelTema = "reunion" | "correo" | "llamada" | "tarea";

/** Algo de lo que puede salir un tema. */
export interface CandidatoDeTema {
  texto: string;
  origen: OrigenDelTema;
  /** El título de la reunión, el asunto del correo o «T-12». */
  fuente: string;
  /** ISO: cuándo pasó (la reunión, el correo) o cuándo se creó la tarea. */
  fecha: string;
  /** El lugar del tema dentro de su reunión (0 = el primero). En lo demás, 0. */
  posicion: number;
  /** A dónde lleva: la reunión en Nexus. null = sin página propia. */
  href: string | null;
}

export interface TemaDeLaCuenta {
  /** Corto, para la fila. */
  texto: string;
  /** Entero, para el `title`. */
  completo: string;
  origen: OrigenDelTema;
  fuente: string;
  fecha: string;
  href: string | null;
}

/**
 * Un tema en una línea corta. Los temas de la minuta suelen ser «Rótulo: explicación»: queda el rótulo si es razonable
 * (entre 8 y 70 caracteres). Si no, se corta en la última palabra que entra, con «…».
 */
export function temaCorto(texto: string, largo = LARGO_DE_UN_TEMA): string {
  const t = texto.replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
  const dos = t.indexOf(":");
  if (dos >= 8 && dos <= 70) return t.slice(0, dos).trim();
  if (t.length <= largo) return t;
  const corte = t.slice(0, largo);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > largo * 0.6 ? corte.slice(0, espacio) : corte).replace(/[,;:\s]+$/, "")}…`;
}

/** Lo que se le quita a un asunto: «Re:», «RV:», «Fwd:», «[EXTERNO]»… */
const PREFIJOS = /^(?:\s*(?:(?:re|rv|fwd?|reenviar)\s*:|\[[^\]]{1,20}\]))+\s*/i;
/** Asuntos que no son un tema: las invitaciones y respuestas del calendario, los automáticos. */
const NO_ES_TEMA =
  /^(?:invitaci[oó]n|invitation|updated invitation|invitaci[oó]n actualizada|aceptado|accepted|rechazado|declined|tentativo|tentative|evento cancelado|canceled event|cancelled event|recordatorio|reminder|out of office|fuera de la oficina|respuesta autom[aá]tica|automatic reply)\b/i;

/** El asunto de un correo o una llamada como tema. null = no dice de qué se trata. */
export function asuntoComoTema(asunto: string | null | undefined): string | null {
  if (!asunto) return null;
  const limpio = asunto.replace(PREFIJOS, "").replace(/\s+/g, " ").trim();
  if (limpio.length < 4 || NO_ES_TEMA.test(limpio)) return null;
  return limpio;
}

/** Los temas de una minuta (`SessionMinute.topics`): solo los textos. */
export function temasDeLaMinuta(topics: unknown): string[] {
  if (!Array.isArray(topics)) return [];
  return topics.flatMap((t) => (typeof t === "string" && t.trim() ? [t.trim()] : []));
}

/**
 * De 2 a 4 temas de una cuenta. Primero lo más reciente; dentro de una reunión, sus primeros temas (la minuta los pone
 * en orden de importancia): cada lugar más abajo en la lista pesa como 3 días más viejo. Las tareas abiertas entran solo
 * si las reuniones y los correos no llegan a `MIN_TEMAS`. Dos temas que hablan de lo mismo (`mismoTema`, sin el nombre
 * de la cuenta) cuentan una vez.
 */
export function elegirTemas(candidatos: readonly CandidatoDeTema[], empresa: string, max = MAX_TEMAS): TemaDeLaCuenta[] {
  const puntaje = (c: CandidatoDeTema) => (Date.parse(c.fecha) || 0) - c.posicion * 3 * DIA_MS;
  const ordenar = (l: readonly CandidatoDeTema[]) =>
    [...l].sort((a, b) => puntaje(b) - puntaje(a) || a.texto.localeCompare(b.texto, "es"));
  const elegidos: { c: CandidatoDeTema; tema: ReturnType<typeof temaDeLaTarea> }[] = [];
  const sumar = (l: readonly CandidatoDeTema[], hasta: number) => {
    for (const c of ordenar(l)) {
      if (elegidos.length >= hasta) return;
      const texto = c.texto.trim();
      if (!texto) continue;
      const tema = temaDeLaTarea({ titulo: texto, contexto: null }, empresa);
      const repetido = elegidos.some(
        (e) => e.c.texto.trim().toLowerCase() === texto.toLowerCase() || (tema.raices.length > 0 && mismoTema(e.tema, tema)),
      );
      if (!repetido) elegidos.push({ c, tema });
    }
  };
  sumar(
    candidatos.filter((c) => c.origen !== "tarea"),
    max,
  );
  if (elegidos.length < MIN_TEMAS) sumar(candidatos.filter((c) => c.origen === "tarea"), Math.min(max, MIN_TEMAS));
  return elegidos.map(({ c }) => ({
    texto: temaCorto(c.texto),
    completo: c.texto.trim(),
    origen: c.origen,
    fuente: c.fuente,
    fecha: c.fecha,
    href: c.href,
  }));
}

// ── La próxima sesión ─────────────────────────────────────────────────────────────────────────

export interface SesionQueViene {
  clientId: string;
  titulo: string;
  /** ISO. */
  inicio: string;
  fuente: "calendario" | "tarea";
}

/** La próxima sesión con la cuenta entre ahora y `dias` días. null = no hay ninguna. */
export function proximaSesionDe(
  reuniones: readonly SesionQueViene[],
  clientId: string,
  ahora: Date,
  dias = DIAS_PARA_LA_PROXIMA_SESION,
): SesionQueViene | null {
  const desde = ahora.getTime();
  const hasta = desde + dias * DIA_MS;
  return (
    reuniones
      .filter((r) => {
        const t = Date.parse(r.inicio);
        return r.clientId === clientId && Number.isFinite(t) && t >= desde && t <= hasta;
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? null
  );
}

// ── La fila ───────────────────────────────────────────────────────────────────────────────────

export interface PersonaDelSeguimiento {
  nombre: string;
  email: string | null;
}

/** El siguiente paso como lo muestra la fila: SOLO estos campos (`pasoDelSeguimiento` los copia uno por uno). */
export type PasoDelSeguimiento =
  | { tipo: "reunion"; dia: string; inicio: string; titulo: string }
  | { tipo: "accion"; dia: string; numero: number; titulo: string };

/**
 * El paso de la cartera, campo por campo: si la cartera le suma un dato, no viaja a la pantalla del CSE sin que alguien
 * lo decida (lib/mi-dia/seguimiento-frontera.test.ts).
 */
export function pasoDelSeguimiento(p: PasoDeLaEmpresa | null): PasoDelSeguimiento | null {
  if (!p) return null;
  return p.tipo === "reunion"
    ? { tipo: "reunion", dia: p.dia, inicio: p.inicio, titulo: p.titulo }
    : { tipo: "accion", dia: p.dia, numero: p.numero, titulo: p.titulo };
}

/**
 * ¿La próxima sesión cae después de la ventana de la regla de servicio (8 días)? Entonces todavía no es el siguiente
 * paso de esta semana, y la fila lo dice.
 */
export function sesionFueraDeLaRegla(f: Pick<FilaDeSeguimiento, "proximaSesion">, hoyISO: string): boolean {
  if (!f.proximaSesion) return false;
  const dia = new Date(Date.parse(f.proximaSesion.inicio) - 6 * 3_600_000).toISOString().slice(0, 10);
  return (Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoyISO}T00:00:00Z`)) / DIA_MS > DIAS_PARA_LA_REUNION;
}

export interface FilaDeSeguimiento {
  clientId: string;
  nombre: string;
  /** El CSE de la cuenta (quien lleva más proyectos de Customer Success en ella). */
  cse: PersonaDelSeguimiento | null;
  /** El CSE que tenía y está de baja. */
  cseDeBaja: string | null;
  /** La lleva quien mira (es el encargado en HubSpot de alguno de sus proyectos). */
  tuya: boolean;
  /** El color de la cuenta. null = quien mira no lo ve (una cuenta compartida que no lleva). */
  salud: SaludDeCs | null;
  porque: string | null;
  proximaSesion: SesionQueViene | null;
  /** false = no se pudo leer el calendario de quien la lleva: «sin sesión» puede no ser cierto. */
  calendarioLeido: boolean;
  /** El siguiente paso de la regla única. null = no tiene. */
  paso: PasoDelSeguimiento | null;
  /** Quién lleva el siguiente paso: el responsable de la tarea, o quien tiene la reunión en su calendario. */
  pasoLleva: PersonaDelSeguimiento | null;
  /** La última reunión con el cliente (no de puertas adentro). */
  ultimaReunion: { sessionId: string; titulo: string; fecha: string } | null;
  temas: TemaDeLaCuenta[];
  /** Los correos del cliente de la última reunión, para «Agendar». */
  invitados: string[];
}

/** ¿Sin sesión agendada? Solo si se pudo leer el calendario: si no, no se sabe. */
export function sinSesion(f: Pick<FilaDeSeguimiento, "proximaSesion" | "calendarioLeido">): boolean {
  return f.proximaSesion === null && f.calendarioLeido;
}

export function sinPaso(f: Pick<FilaDeSeguimiento, "paso">): boolean {
  return f.paso === null;
}

/**
 * Cuánto pide atención una fila (más alto = más arriba): sin sesión y sin paso, después sin paso, después sin sesión.
 * El siguiente paso pesa más que la sesión: sin él, nadie hace nada con la cuenta esta semana.
 */
export function atencionDe(f: Pick<FilaDeSeguimiento, "proximaSesion" | "calendarioLeido" | "paso">): number {
  return (sinPaso(f) ? 2 : 0) + (sinSesion(f) ? 1 : 0);
}

/** Días desde la última reunión. null = no hubo en la ventana. */
export function diasDesdeLaUltima(f: Pick<FilaDeSeguimiento, "ultimaReunion">, hoyISO: string): number | null {
  if (!f.ultimaReunion) return null;
  const dia = new Date(Date.parse(f.ultimaReunion.fecha) - 6 * 3_600_000).toISOString().slice(0, 10);
  return Math.max(0, Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / DIA_MS));
}

/**
 * Por lo que más pide atención: primero lo que falta (`atencionDe`), después el color (lo rojo arriba), después la que
 * lleva más tiempo sin una reunión con el cliente (sin ninguna, primero) y al final por nombre.
 */
export function ordenarSeguimiento(filas: readonly FilaDeSeguimiento[], hoyISO: string): FilaDeSeguimiento[] {
  const sinReunion = (f: FilaDeSeguimiento) => diasDesdeLaUltima(f, hoyISO) ?? Number.MAX_SAFE_INTEGER;
  return [...filas].sort(
    (a, b) =>
      atencionDe(b) - atencionDe(a) ||
      ORDEN_DE_SALUD[a.salud ?? "sin-datos"] - ORDEN_DE_SALUD[b.salud ?? "sin-datos"] ||
      sinReunion(b) - sinReunion(a) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}

// ── Filtros ───────────────────────────────────────────────────────────────────────────────────

export interface FiltrosDeSeguimiento {
  /**
   * El correo del CSE de la cuenta; "tuyas" = las que lleva quien mira (es el encargado de algún proyecto, aunque el CSE
   * de la cuenta sea otro); "sin" = sin CSE; "" = todas.
   */
  cse: string;
  sinSesion: boolean;
  sinPaso: boolean;
}

/** Las cuentas que lleva quien mira. */
export const TUYAS = "tuyas";

/**
 * El CSE ve de entrada las que lleva (`tuya`: es el encargado en HubSpot de alguno de sus proyectos), no las que tiene
 * como «CSE de la cuenta»: si otro CSE lleva más proyectos en la misma cuenta, esa cuenta igual es suya. Quien lidera
 * Customer Success, todas.
 */
export function filtrosPorDefecto(o: { lider: boolean }): FiltrosDeSeguimiento {
  return { cse: o.lider ? "" : TUYAS, sinSesion: false, sinPaso: false };
}

const claveDeCse = (p: PersonaDelSeguimiento | null) => (p ? (p.email ?? p.nombre).toLowerCase() : "");

export function filtrarSeguimiento(filas: readonly FilaDeSeguimiento[], f: FiltrosDeSeguimiento): FilaDeSeguimiento[] {
  return filas.filter(
    (x) =>
      (f.cse === "" ||
        (f.cse === TUYAS ? x.tuya : f.cse === "sin" ? x.cse === null : claveDeCse(x.cse) === f.cse.toLowerCase())) &&
      (!f.sinSesion || sinSesion(x)) &&
      (!f.sinPaso || sinPaso(x)),
  );
}

/** Los CSE de las filas, en orden alfabético, y si hay cuentas sin CSE. */
export function cseDelSeguimiento(filas: readonly FilaDeSeguimiento[]): { cses: { clave: string; nombre: string }[]; haySinCse: boolean } {
  const cses = new Map<string, string>();
  let haySinCse = false;
  for (const f of filas) {
    if (f.cse) cses.set(claveDeCse(f.cse), f.cse.nombre);
    else haySinCse = true;
  }
  return {
    cses: [...cses].map(([clave, nombre]) => ({ clave, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    haySinCse,
  };
}

/** Cuántas cuentas, cuántas sin sesión y cuántas sin siguiente paso (de las que se ven con el filtro del CSE). */
export function conteosDelSeguimiento(filas: readonly FilaDeSeguimiento[]): { total: number; sinSesion: number; sinPaso: number; sinCalendario: number } {
  return {
    total: filas.length,
    sinSesion: filas.filter(sinSesion).length,
    sinPaso: filas.filter(sinPaso).length,
    sinCalendario: filas.filter((f) => !f.calendarioLeido && !f.proximaSesion).length,
  };
}
