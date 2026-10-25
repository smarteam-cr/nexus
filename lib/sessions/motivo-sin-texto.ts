/**
 * lib/sessions/motivo-sin-texto.ts — EL MOTIVO DE CADA REUNIÓN SIN TEXTO, guardado y dicho en la reunión misma (T4,
 * 2026-10-25; docs/reuniones-pieza-angular-plan.md). PURO y client-safe.
 *
 * El motivo lo calcula lib/google/por-que-falta.ts (la regla única, con quién lo arregla). Acá vive lo que se hace con
 * él: leer el que está guardado en `FirefliesSession.motivoSinTexto` (lo escribe el job `reuniones-motivos`), decir
 * cuáles son de espera (se resuelven solos y la reunión no avisa nada todavía) y, para quien la organizó, cómo evitarlo
 * la próxima vez. La reunión avisa con lo guardado; si todavía no hay nada guardado (una reunión de hace minutos, o
 * antes de la primera corrida del job), con el de ahora.
 */
import { DE_QUIEN_ES, porQueFalta, type DuenoDelArreglo, type MotivoDeLaFalta, type ReunionSinTranscripcion } from "@/lib/google/por-que-falta";
import type { ClaseDeTexto } from "./tiene-texto";

/** Los motivos que se resuelven solos: la reunión dice «esperando la transcripción» y nada más. */
export const MOTIVOS_DE_ESPERA: ReadonlySet<MotivoDeLaFalta> = new Set<MotivoDeLaFalta>([
  "todavia_no_termino",
  "pendiente_de_leer",
  "esperando_a_google",
  "fallo_de_lectura_reintentando",
]);

/** ¿El texto guardado es un motivo que Nexus conoce? Uno viejo o raro se trata como «no guardado». */
export function leerMotivoGuardado(crudo: string | null | undefined): MotivoDeLaFalta | null {
  return crudo && Object.prototype.hasOwnProperty.call(DE_QUIEN_ES, crudo) ? (crudo as MotivoDeLaFalta) : null;
}

/** El motivo que se muestra: el guardado; si no hay, el de ahora. */
export function motivoParaMostrar(guardado: string | null | undefined, r: ReunionSinTranscripcion, ahora: Date): MotivoDeLaFalta {
  return leerMotivoGuardado(guardado) ?? porQueFalta(r, ahora);
}

/**
 * Para quien la organizó (o estuvo): cómo evitar que la próxima reunión termine igual. null = no depende de la persona
 * (lo arregla Nexus, o no hay nada que arreglar).
 */
export const COMO_EVITARLO: Readonly<Record<MotivoDeLaFalta, string | null>> = {
  cancelada: null,
  no_ocurrio: null,
  todavia_no_termino: null,
  pendiente_de_leer: null,
  esperando_a_google: null,
  fallo_de_lectura_reintentando: null,
  fallo_de_lectura_sellada: null,
  leida_antes_de_terminar: null,
  sin_nadie_del_equipo: "Invita a alguien del equipo a la reunión con su correo de Smarteam: sin eso, Nexus no tiene con qué cuenta leerla.",
  solo_notas_sin_transcripcion:
    "Al empezar la reunión, activa también «Transcripción» (en Meet, el botón «Actividades» o el de las notas de Gemini), no solo «Tomar notas».",
  documento_vacio:
    "Gemini abrió el documento pero no tomó nada: pasa cuando se activa al final o la reunión fue muy corta. Actívalo al empezar.",
  no_se_grabo:
    "En la invitación del calendario, abre las opciones de la videollamada de Meet y activa «Tomar notas con Gemini» y «Transcripción»: así arrancan solas en cada reunión.",
  organizada_por_afuera:
    "La organizó alguien de afuera: al entrar, activa tú «Tomar notas con Gemini» y «Transcripción» (el documento queda en tu Drive y Nexus lo lee), o pídeselo a quien la organizó.",
};

/** El motivo, dicho en la reunión. */
export interface MotivoVistoEnLaReunion {
  motivo: MotivoDeLaFalta;
  texto: string;
  dueno: DuenoDelArreglo;
  /** Solo para quien la organizó o estuvo: cómo evitarlo la próxima vez. */
  comoEvitarlo: string | null;
}

/**
 * El motivo para la página de la reunión, o null si la reunión todavía está esperando (eso ya lo dice el aviso
 * «Esperando la transcripción»). `estuvo`: quien mira la organizó o estuvo invitado.
 */
export function motivoEnLaReunion(motivo: MotivoDeLaFalta, estuvo: boolean): MotivoVistoEnLaReunion | null {
  if (MOTIVOS_DE_ESPERA.has(motivo)) return null;
  const d = DE_QUIEN_ES[motivo];
  return { motivo, texto: d.texto, dueno: d.dueno, comoEvitarlo: estuvo ? COMO_EVITARLO[motivo] : null };
}

/** ¿Hay que escribir este motivo? Solo si cambió (o si la reunión ya tiene texto y quedó uno viejo). */
export function cambioDeMotivo(guardado: string | null, nuevo: MotivoDeLaFalta | null): boolean {
  return (guardado ?? null) !== nuevo;
}

/* ── Lo que guarda el job (lib/sessions/motivo-sin-texto-server.ts) ─────────────────── */

/** Una reunión como la lee el job, sin los textos. */
export interface FilaParaElMotivo {
  id: string;
  date: Date;
  duration: number | null;
  organizerEmail: string | null;
  participants: string[] | null;
  enrichedAt: Date | null;
  enrichAttempts: number;
  enrichError: string | null;
  googleDocId: string | null;
  canceladaEn: Date | null;
  clase: ClaseDeTexto;
  aMano: boolean;
  tieneNotas: boolean;
  motivoSinTexto: string | null;
}

/** PURA. El motivo que le toca a cada fila (null = tiene texto). */
export function motivoQueLeToca(f: FilaParaElMotivo, ahora: Date): MotivoDeLaFalta | null {
  if (f.clase !== "nada" || f.aMano) return null;
  return porQueFalta(
    {
      date: f.date,
      duration: f.duration,
      enrichedAt: f.enrichedAt,
      enrichAttempts: f.enrichAttempts,
      enrichError: f.enrichError,
      googleDocId: f.googleDocId,
      organizerEmail: f.organizerEmail,
      participants: f.participants ?? [],
      tieneNotas: f.tieneNotas,
      canceladaEn: f.canceladaEn,
    },
    ahora,
  );
}

/** PURA. Qué escribir: los ids por motivo nuevo (null = borrar el que tenía). Solo lo que cambió. */
export function cambiosDeMotivo(filas: readonly FilaParaElMotivo[], ahora: Date): Map<MotivoDeLaFalta | null, string[]> {
  const cambios = new Map<MotivoDeLaFalta | null, string[]>();
  for (const f of filas) {
    const nuevo = motivoQueLeToca(f, ahora);
    if (!cambioDeMotivo(f.motivoSinTexto, nuevo)) continue;
    cambios.set(nuevo, [...(cambios.get(nuevo) ?? []), f.id]);
  }
  return cambios;
}
