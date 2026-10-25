/**
 * lib/canvas/estado-del-documento.ts — las REGLAS del estado de un documento (2026-10-02). PURO.
 *
 * ── EL FLUJO REAL (Caroline Bersot, Alex Vanegas y Elías) ────────────────────────────────────
 * El diagnóstico se presenta; el cliente agrega cosas que no había contado; esa sesión se suma al
 * contexto y se regenera conservando el historial; y Caroline pide la aprobación formal por correo
 * antes de pasar a planificación. Tres estados:
 *
 *   borrador ──Presentar──▶ presentado ──Registrar aprobación──▶ aprobado
 *      ▲                       │  regenerar o reabrir                │ reabrir (con motivo)
 *      └───────── v+1 ─────────┴─────────────────────────────────────┘
 *
 *  · PRESENTAR exige el hilo cerrado (lib/canvas/revisar-hilo.ts: ninguna acción sin causa ni
 *    objetivo, ningún problema sin acción), el enfoque de la solución revisado por el ejecutivo y, desde el
 *    2026-10-24 (L2 etapa 2 del roadmap), el desafío principal revisado. Deja una FOTO PROTEGIDA de lo que vio
 *    el cliente (lib/canvas/versiones.ts). Cada motivo dice en qué sección se arregla (`detalle`): «Presentar»
 *    y «Publicar el enlace» los listan con un enlace a esa sección.
 *  · Lo que pasa después de presentar abre la versión siguiente: la vN presentada queda en el
 *    historial, intacta.
 *  · APROBAR solo se registra sobre lo presentado y sin cambios desde entonces: el cliente aprobó lo
 *    que vio. Pide quién, cuándo y la evidencia (el correo).
 *  · APROBADO = cerrado: no se regenera ni se edita hasta reabrirlo, con motivo.
 *
 * Nexus no manda el correo (lo pide Caroline, como siempre) ni mueve la etapa en HubSpot: registra.
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
  /** Los mismos motivos con la sección donde se arreglan (L2, 2026-10-24). Opcional: una respuesta vieja no lo trae. */
  motivosConSeccion?: MotivoParaPresentar[];
  /** Cambió desde que se presentó (no se puede registrar la aprobación sin volver a presentar). */
  cambiosDesdeLaPresentacion: boolean;
  hitos: HitoVista[];
}

/** Un motivo para no presentar y la sección donde se arregla (null = del documento entero). */
export interface MotivoParaPresentar {
  texto: string;
  seccion: string | null;
}

export interface RevisionParaPresentar {
  ok: boolean;
  /** Por qué no se puede, en frases para la persona. Vacío si `ok`. */
  motivos: string[];
  /** Los mismos, con su sección (en el mismo orden). */
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
  const fin = (): RevisionParaPresentar => ({ ok: detalle.length === 0, motivos: detalle.map((m) => m.texto), detalle });
  if (opts.estado === "aprobado") {
    detalle.push({ texto: "Ya está aprobado por el cliente: para cambiarlo, reábrelo.", seccion: null });
    return fin();
  }
  if (!opts.tieneContenido) {
    detalle.push({ texto: "Todavía no hay nada que presentar: genera el diagnóstico primero.", seccion: null });
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

export interface DatosDeAprobacion {
  /** Quién del cliente aprobó. */
  nombre: string;
  /** Su correo (opcional, pero si viene tiene que ser un correo). */
  email: string;
  /** Cuándo (AAAA-MM-DD). */
  fecha: string;
  /** El correo de aprobación pegado (o una descripción de la evidencia adjunta). */
  evidencia: string;
  /** Un documento del proyecto con la evidencia (el correo en PDF, por ejemplo). */
  evidenciaDocumentoId?: string | null;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida lo que se registra como aprobación. `hoy` se pasa para poder probarlo. */
export function validarAprobacion(d: DatosDeAprobacion, hoy: Date): { ok: true; fecha: Date } | { ok: false; error: string } {
  if (!d.nombre.trim()) return { ok: false, error: "Falta quién aprobó del lado del cliente." };
  if (d.email.trim() && !CORREO.test(d.email.trim())) return { ok: false, error: "El correo de quien aprobó no es válido." };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.fecha.trim());
  if (!m) return { ok: false, error: "Falta la fecha de la aprobación." };
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(fecha.getTime())) return { ok: false, error: "La fecha de la aprobación no es válida." };
  const manana = new Date(hoy.getTime() + 36 * 3600 * 1000);
  if (fecha.getTime() > manana.getTime()) return { ok: false, error: "La fecha de la aprobación no puede ser futura." };
  if (!d.evidencia.trim() && !d.evidenciaDocumentoId) {
    return { ok: false, error: "Falta la evidencia: pega el correo de aprobación o adjúntalo." };
  }
  return { ok: true, fecha };
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

/** El cuerpo de la nota que queda en la empresa en HubSpot al registrar la aprobación. */
export function notaDeAprobacion(d: {
  documento: string;
  version: number;
  nombre: string;
  email: string;
  fecha: Date;
  evidencia: string;
  registradoPor: string | null;
}): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const evidencia = d.evidencia.trim().slice(0, 3000);
  return [
    `<p><strong>${esc(d.documento)} v${d.version} aprobado por el cliente.</strong></p>`,
    `<p>Aprobó: ${esc(d.nombre)}${d.email ? ` (${esc(d.email)})` : ""}, el ${esc(fechaLarga(d.fecha))}.</p>`,
    d.registradoPor ? `<p>Registrado en Nexus por ${esc(d.registradoPor)}.</p>` : "",
    evidencia ? `<p>Evidencia:</p><blockquote>${esc(evidencia).replace(/\n/g, "<br>")}</blockquote>` : "",
  ]
    .filter(Boolean)
    .join("");
}

// ── El cliente aprueba desde su enlace (2026-10-04) ──────────────────────────────────────────────

/** Lo que el cliente declara al aprobar desde su enlace. Va tal cual a la evidencia y a la nota de HubSpot. */
export const TEXTO_DE_APROBACION_DEL_CLIENTE = "Leí este diagnóstico y lo apruebo como base para la planificación.";

/** Lo que el cliente puede hacer con la versión que VE en su enlace. */
export type AprobacionEnElEnlace =
  | { estado: "por-aprobar" }
  | { estado: "aprobado"; nombre: string | null; fecha: string | null }
  | { estado: "en-revision" };

/**
 * El enlace muestra la última versión presentada o aprobada (`vista`); el equipo puede estar ya en
 * otra (`vivo`). El cliente aprueba SOLO lo que está viendo, y solo si es lo vigente: presentado, la
 * misma versión y sin cambios desde que se presentó. Si el equipo ya está ajustando (regeneró, editó o
 * reabrió), espera la versión nueva. Una versión aprobada se muestra como aprobada aunque después se
 * haya reabierto: es lo que el cliente aprobó.
 */
export function aprobacionEnElEnlace(d: {
  vista: { tipo: string; version: number; aprobadoPorNombre: string | null; aprobadoEl: Date | string | null };
  vivo: { estado: EstadoDocumento; version: number; cambiosDesdeLaPresentacion: boolean } | null;
}): AprobacionEnElEnlace {
  if (d.vista.tipo === "aprobado") {
    const fecha = d.vista.aprobadoEl ? new Date(d.vista.aprobadoEl) : null;
    return {
      estado: "aprobado",
      nombre: d.vista.aprobadoPorNombre?.trim() || null,
      fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : null,
    };
  }
  const v = d.vivo;
  if (v && v.estado === "presentado" && v.version === d.vista.version && !v.cambiosDesdeLaPresentacion) {
    return { estado: "por-aprobar" };
  }
  return { estado: "en-revision" };
}

/** La evidencia que queda cuando aprueba el cliente desde su enlace (no hay correo que pegar). */
export function evidenciaDelEnlace(nombre: string, email: string): string {
  return `Aprobado por el cliente desde su enlace de Nexus: ${nombre.trim()}${email.trim() ? ` (${email.trim()})` : ""} marcó «${TEXTO_DE_APROBACION_DEL_CLIENTE}»`;
}
