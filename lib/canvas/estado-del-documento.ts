/**
 * lib/canvas/estado-del-documento.ts — las REGLAS del estado de un documento (2026-10-02). PURO.
 *
 * ── EL FLUJO REAL (Caroline Bersot, Alex Vanegas y Elías) ────────────────────────────────────
 * El diagnóstico se presenta; el cliente agrega cosas que no había contado; esa sesión se suma al
 * contexto y se regenera conservando el historial. Dos estados en uso:
 *
 *   borrador ──Presentar──▶ presentado
 *      ▲                       │  regenerar o reabrir
 *      └───────── v+1 ─────────┘
 *
 *  · PRESENTAR exige contenido. El hilo (lib/canvas/revisar-hilo.ts), el enfoque de la solución y el desafío
 *    principal sin revisar son AVISOS desde el 2026-10-28: se listan con su sección y no frenan. Deja una FOTO
 *    PROTEGIDA de lo que vio el cliente (lib/canvas/versiones.ts).
 *  · Lo que pasa después de presentar abre la versión siguiente: la vN presentada queda en el
 *    historial, intacta.
 *  · La APROBACIÓN (registrarla el equipo o darla el cliente desde su enlace) se quitó entera el 2026-10-28
 *    (Elías, por Cemaco). «aprobado» sigue en el tipo solo para leer registros viejos: no hay ninguno y nada
 *    lo escribe; un documento así quedaría cerrado hasta reabrirlo.
 *
 * Este módulo es la parte pura (qué se puede y por qué no); la que escribe vive en
 * `estado-del-documento-servidor.ts`.
 */
import type { CaboSuelto } from "./revisar-hilo";

export type EstadoDocumento = "borrador" | "presentado" | "aprobado";

export const ETIQUETA_DEL_ESTADO: Record<EstadoDocumento, string> = {
  borrador: "Borrador",
  presentado: "Presentado",
  aprobado: "Aprobado",
};

/** Lo que se le dice a quien intenta cambiar un documento aprobado (regenerar, el chat, restaurar…). */
export const MENSAJE_APROBADO =
  "El diagnóstico está aprobado por el cliente: para cambiarlo, reábrelo (queda en el historial y abre la versión siguiente).";

/** La columna guarda null para el borrador; cualquier valor raro se lee como borrador. */
export function leerEstado(raw: string | null | undefined): EstadoDocumento {
  return raw === "presentado" || raw === "aprobado" ? raw : "borrador";
}

/** El valor que se guarda en la columna (null = borrador). */
export function aColumna(estado: EstadoDocumento): string | null {
  return estado === "borrador" ? null : estado;
}

/** Un hito del historial, como lo ve la pantalla. */
export interface HitoVista {
  id: string;
  version: number;
  tipo: string;
  porEmail: string | null;
  createdAt: string;
  fotoId: string | null;
  aprobadoPorNombre: string | null;
  aprobadoPorEmail: string | null;
  aprobadoEl: string | null;
  evidencia: string | null;
  evidenciaDocumentoId: string | null;
  hubspotNotaId: string | null;
  hubspotError: string | null;
  motivo: string | null;
}

export interface EstadoVista {
  estado: EstadoDocumento;
  version: number;
  /** La fecha que dice la portada: la del último hito, o la de la última edición en borrador. */
  fecha: string | null;
  cliente: string;
  /** Lo que impide presentar hoy (vacío = se puede). Solo informativo: el servidor revisa al presentar. */
  motivosParaNoPresentar: string[];
  /** Todos los motivos (los que bloquean y los avisos) con la sección donde se arreglan. Opcional: una respuesta vieja no lo trae. */
  motivosConSeccion?: MotivoParaPresentar[];
  /** Cambió desde que se presentó (no se puede registrar la aprobación sin volver a presentar). */
  cambiosDesdeLaPresentacion: boolean;
  hitos: HitoVista[];
}

/**
 * Un motivo y la sección donde se arregla (null = del documento entero). `bloquea`: impide presentar. Desde el
 * 2026-10-28 (Elías, por el diagnóstico de Cemaco que había que presentar ese día) solo bloquean «ya aprobado» y «sin
 * contenido»; el hilo con cabos sueltos y lo que sigue siendo de la IA quedan como AVISO: se muestran, no frenan.
 */
export interface MotivoParaPresentar {
  texto: string;
  seccion: string | null;
  bloquea?: boolean;
}

export interface RevisionParaPresentar {
  /** Se puede presentar: ningún motivo bloquea (puede haber avisos). */
  ok: boolean;
  /** Lo que IMPIDE presentar, en frases para la persona. Vacío si `ok`. */
  motivos: string[];
  /** Todos los motivos, los que bloquean y los avisos, con su sección. */
  detalle: MotivoParaPresentar[];
}

/** La key de la sección del desafío principal (diagnostico.defs.ts). */
export const DESAFIO_KEY = "desafio";

/** ¿La sección de prosa tiene algo escrito (la frase o al menos un punto)? */
function prosaConContenido(d: { intro?: unknown; items?: unknown } | undefined): boolean {
  return !!d && ((typeof d.intro === "string" && d.intro.trim() !== "") || (Array.isArray(d.items) && d.items.length > 0));
}

/** ¿La revisó una persona? (`revisadaAt`, fuera del esquema del agente.) */
export function marcadaRevisada(data: unknown): boolean {
  const r = (data as { revisadaAt?: unknown } | null | undefined)?.revisadaAt;
  return typeof r === "string" && r.trim() !== "";
}

/**
 * ¿Se puede presentar? Junta TODOS los motivos (no el primero): la persona arregla todo de una vez.
 *
 * `politica`: la data de la sección «Enfoque de la solución» (key `politica_rectora`; «Política rectora» hasta el
 * 2026-10-23), o `undefined` si el documento no la tiene o está oculta. `politicaOculta`: la ocultó una persona — desde
 * el 2026-10-23 toda sección se puede ocultar, y un enfoque que no se presenta no frena la presentación.
 */
export function revisarParaPresentar(opts: {
  estado: EstadoDocumento;
  tieneContenido: boolean;
  cabos: readonly CaboSuelto[];
  politica: unknown;
  politicaOculta?: boolean;
  /**
   * La data del «Desafío principal» (L2 etapa 2, 2026-10-24), o `undefined` si el documento no la tiene. Con algo escrito,
   * tiene que estar revisado, como el enfoque. Oculto (`desafioOculto`) no frena. Vacío tampoco: el hilo ya lo dice.
   */
  desafio?: unknown;
  desafioOculto?: boolean;
}): RevisionParaPresentar {
  const detalle: MotivoParaPresentar[] = [];
  const fin = (): RevisionParaPresentar => {
    const bloquean = detalle.filter((m) => m.bloquea);
    return { ok: bloquean.length === 0, motivos: bloquean.map((m) => m.texto), detalle };
  };
  if (opts.estado === "aprobado") {
    detalle.push({ texto: "Ya está aprobado por el cliente: para cambiarlo, reábrelo.", seccion: null, bloquea: true });
    return fin();
  }
  if (!opts.tieneContenido) {
    detalle.push({ texto: "Todavía no hay nada que presentar: genera el diagnóstico primero.", seccion: null, bloquea: true });
    return fin();
  }
  const rotos = opts.cabos.filter((c) => c.bloquea);
  if (rotos.length) {
    detalle.push({
      texto: `El hilo tiene ${rotos.length} ${rotos.length === 1 ? "cabo suelto" : "cabos sueltos"}: ${rotos
        .slice(0, 3)
        .map((c) => c.texto)
        .join(" ")}${rotos.length > 3 ? " …" : ""}`,
      // Se arregla en la sección del primer cabo suelto.
      seccion: rotos[0].seccion,
    });
  }
  const d = opts.desafio as { intro?: unknown; items?: unknown; revisadaAt?: unknown } | undefined;
  if (!opts.desafioOculto && prosaConContenido(d) && !marcadaRevisada(d)) {
    detalle.push({
      texto: "El desafío principal sigue siendo el de la IA: revísalo con lo que dijo el cliente y márcalo como revisado.",
      seccion: DESAFIO_KEY,
    });
  }
  const p = opts.politica as { intro?: unknown; items?: unknown; revisadaAt?: unknown } | undefined;
  if (opts.politicaOculta) {
    // Oculto a propósito: no se presenta, así que no hay nada que revisar.
  } else if (!prosaConContenido(p)) {
    detalle.push({ texto: "Falta el enfoque de la solución: regenera el diagnóstico o escríbelo antes de presentar.", seccion: "politica_rectora" });
  } else if (!marcadaRevisada(p)) {
    detalle.push({ texto: "El enfoque de la solución sigue siendo la sugerencia de la IA: ajústalo y márcalo como revisado.", seccion: "politica_rectora" });
  }
  return fin();
}

function fechaLarga(d: Date): string {
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
}

/** La línea de la portada, como en FUNDAUNA: «Cliente: X · Fecha: … · Versión: v1 · Estado: Borrador». */
export function lineaDelDocumento(d: { cliente: string; fecha: Date | null; version: number; estado: EstadoDocumento }): string {
  return [
    d.cliente ? `Cliente: ${d.cliente}` : "",
    d.fecha ? `Fecha: ${fechaLarga(d.fecha)}` : "",
    `Versión: v${d.version}`,
    `Estado: ${ETIQUETA_DEL_ESTADO[d.estado]}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
