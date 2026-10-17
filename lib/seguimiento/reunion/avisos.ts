/**
 * lib/seguimiento/reunion/avisos.ts — los AVISOS de una reunión: lo que conviene saber de ella antes de usar lo que
 * dejó. PURO. Ficha G (2026-10-17).
 *
 * Son de dos clases, en una sola lista:
 *   · el estado de la reunión, calculado al leer: todavía no ocurre, esperando la transcripción, terminó sin nada que
 *     leer, la lectura falló, no tiene cliente, es de un aliado o de Smarteam, fue de puertas adentro, no tiene proyecto;
 *   · los avisos de «Para ti» que le llegaron a quien mira y llevan a esta reunión (por ejemplo, «el texto de la
 *     reunión cambió»), con su fecha y si ya los leyó.
 * Cada uno dice qué hacer. Lo que ya dice «Lo que dejó esta reunión» (la minuta sin revisar, las tareas por decidir) no
 * se repite acá.
 */

export type TonoDelAviso = "atencion" | "info";

/** Lo que se puede hacer desde el aviso. «agregar-reunion» abre «+ Agregar reunión» con el cliente puesto. */
export type AccionDelAviso = { tipo: "enlace"; texto: string; href: string } | { tipo: "agregar-reunion"; texto: string } | { tipo: "meta"; texto: string };

export interface AvisoDeLaReunion {
  clave: string;
  tono: TonoDelAviso;
  texto: string;
  /** Solo los de «Para ti»: cuándo llegó y si quien mira ya lo leyó. */
  llego?: { en: string; leido: boolean };
  accion?: AccionDelAviso;
}

export interface EntradaDeLosAvisos {
  ahora: Date;
  /** ISO del inicio. */
  fecha: string;
  duracionMin: number;
  dueno: { id: string; nombre: string; kind: string } | null;
  puertasAdentro: boolean;
  /** Tiene transcripción o notas (de Meet o agregadas a mano). */
  tieneTexto: boolean;
  /** La sync ya intentó traer su texto (`enrichedAt`). */
  enriquecida: boolean;
  /** El estado de su lectura de seguimiento (`LecturaDeReunion.seguimiento*`), si tiene. */
  lectura: { estado: string | null; error: string | null } | null;
  /** Cuántos proyectos tiene el cliente y cuántos están vinculados a esta reunión. */
  proyectosDelCliente: number;
  proyectosVinculados: number;
  /** Los avisos de «Para ti» de quien mira que llevan a esta reunión. */
  personales: { id: string; titulo: string; detalle: string | null; creadoAt: string; leidoAt: string | null }[];
}

/** Cuánto se espera la transcripción después de que termina (lo mismo que reintenta la sync: 48 horas). */
export const HORAS_ESPERANDO_EL_TEXTO = 48;

const EMPRESA_SIN_TARJETA: Record<string, string> = { ALIADO: "un aliado", INTERNO: "Smarteam" };

export function avisosDeLaReunion(e: EntradaDeLosAvisos): AvisoDeLaReunion[] {
  const avisos: AvisoDeLaReunion[] = [];
  const inicio = Date.parse(e.fecha);
  const fin = inicio + Math.max(0, e.duracionMin) * 60_000;
  const ahora = e.ahora.getTime();

  if (inicio > ahora) {
    avisos.push({ clave: "futura", tono: "info", texto: "Todavía no ocurre. Después de la reunión, acá vas a tener lo que dejó, el correo de seguimiento y la próxima reunión sugerida." });
  }

  if (!e.dueno) {
    avisos.push({
      clave: "sin-cliente",
      tono: "atencion",
      texto: "No tiene cliente: Nexus no la lee ni la suma a la memoria de ninguna cuenta. Elige el cliente en Sesiones.",
      accion: { tipo: "enlace", texto: "Ir a Sesiones", href: "/sessions" },
    });
  } else if (EMPRESA_SIN_TARJETA[e.dueno.kind]) {
    avisos.push({ clave: "sin-tarjeta", tono: "info", texto: `Es una reunión con ${EMPRESA_SIN_TARJETA[e.dueno.kind]} (${e.dueno.nombre}): no deja minuta ni correo de seguimiento.` });
  } else if (e.puertasAdentro) {
    avisos.push({
      clave: "puertas-adentro",
      tono: "info",
      texto: "Fue solo con gente de Smarteam: no se lee como una reunión con el cliente y no lleva correo de seguimiento. Sus tareas, si las dejó, las propone Tareas.",
    });
  }

  if (fin <= ahora && !e.tieneTexto) {
    const horas = (ahora - fin) / 3_600_000;
    if (!e.enriquecida || horas < HORAS_ESPERANDO_EL_TEXTO) {
      avisos.push({ clave: "esperando-texto", tono: "info", texto: "Esperando la transcripción: Google la deja un rato después de que termina, y Nexus la vuelve a buscar sola durante dos días." });
    } else {
      avisos.push({
        clave: "sin-texto",
        tono: "atencion",
        texto: "Terminó sin transcripción ni notas: Nexus no tiene qué leer. Si recuerdas lo que pasó, agrégalo y se lee como cualquier reunión.",
        accion: e.dueno ? { tipo: "agregar-reunion", texto: "+ Agregar lo que pasó" } : undefined,
      });
    }
  }

  const l = e.lectura;
  if (l?.estado === "error") {
    avisos.push({ clave: "lectura-error", tono: "atencion", texto: `No se pudo leer${l.error ? `: ${l.error.slice(0, 200)}` : ""}. Vuelve a intentarlo con «Leer esta reunión».` });
  } else if (l?.estado === "en_espera" || l?.estado === "leyendo") {
    avisos.push({ clave: "lectura-en-curso", tono: "info", texto: "Nexus la está leyendo: la minuta y lo que dejó aparecen acá en unos minutos." });
  }

  if (e.dueno && !EMPRESA_SIN_TARJETA[e.dueno.kind] && e.proyectosDelCliente > 0 && e.proyectosVinculados === 0) {
    avisos.push({
      clave: "sin-proyecto",
      tono: "atencion",
      texto: "No está asignada a ningún proyecto del cliente: lo que deja no llega a los documentos del proyecto. Asígnala en la pestaña «Meta».",
      accion: { tipo: "meta", texto: "Asignar proyecto" },
    });
  }

  // Los avisos de «Para ti» que llevan acá: lo no leído primero, lo más nuevo arriba.
  const personales = [...e.personales].sort((a, b) => Number(!!a.leidoAt) - Number(!!b.leidoAt) || Date.parse(b.creadoAt) - Date.parse(a.creadoAt));
  for (const a of personales) {
    avisos.push({
      clave: `aviso:${a.id}`,
      tono: a.leidoAt ? "info" : "atencion",
      texto: a.detalle?.trim() ? `${a.titulo.trim()} ${a.detalle.trim()}` : a.titulo.trim(),
      llego: { en: a.creadoAt, leido: !!a.leidoAt },
    });
  }
  return avisos;
}

/** El `href` de un aviso de «Para ti» que lleva a esta reunión: `/sessions/<id>` con o sin ancla o búsqueda. */
export function avisoLlevaALaReunion(href: string, sessionId: string): boolean {
  const base = `/sessions/${encodeURIComponent(sessionId)}`;
  const crudo = `/sessions/${sessionId}`;
  return [base, crudo].some((b) => href === b || href.startsWith(`${b}#`) || href.startsWith(`${b}?`));
}
