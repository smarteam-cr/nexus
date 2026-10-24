/**
 * lib/google/recuperacion-criterio.ts — QUÉ SESIONES QUEMADAS se pueden rescatar, y cómo.
 * Puro: el criterio entero es una tabla de test, no un `where` suelto adentro de un script.
 *
 * ── LO QUE HAY QUE RESCATAR (medido 2026-08-08) ──────────────────────────────
 * El pipeline viejo sellaba TODO como definitivo. Quedaron tres familias de filas muertas:
 *
 *  A — SELLADAS SIN CONTENIDO, CON DOC: la lectura falló (corridas quemadas del 17-may:
 *      528/1100, y 7-jul: 47/73) o la pestaña estaba renombrada y el parser viejo la perdió
 *      (~464 con notas y sin transcript). El doc EXISTE: re-leer con el pipeline nuevo
 *      recupera el material.
 *  B — SELLADAS SIN CONTENIDO, SIN DOC: la búsqueda en Drive corrió impersonando a un
 *      organizador imposible (cliente/sala), o la sesión se selló ANTES de ocurrir (487
 *      con enrichedAt < date). Con el fallback de impersonación y el filtro de fecha
 *      nuevos, valen otro intento.
 *  C — TRANSCRIPTS BASURA: 66 filas con «transcripts» de menos de 200 chars (esqueletos de
 *      plantilla) contando como éxito. Se resetean Y se les limpia el transcript.
 *
 * ── LO QUE JAMÁS SE TOCA ─────────────────────────────────────────────────────
 * `summary` y las minutas: son trabajo (de Gemini o humano) que existe y sirve. El rescate
 * repone la OPORTUNIDAD de leer, nunca borra contenido bueno. Y un transcript sano (≥200
 * chars) no entra en ningún bucket: no hay nada que rescatarle.
 */
import { elegirImpersonado } from "./elegir-impersonado";
import { MIN_TRANSCRIPT_CHARS } from "./doc-parse";
import { MARGEN_TRAS_EL_FIN_MS, finDeLaReunion } from "./enrich-retry";

/*
 *  D — SELLADAS SIN CONTENIDO ANTES DE TERMINAR (2026-10-17): con alguien del equipo invitado y el
 *      sello antes del fin de la reunión más 20 minutos (con documento o sin él). Hasta ese día la pasada
 *      leía una hora después del INICIO: una reunión de una hora o más se buscaba en Drive cuando la
 *      transcripción todavía no existía y se sellaba vacía para siempre. Solo cuenta con la duración
 *      (`duration`); sin ella no se puede saber cuándo terminó.
 */
export type BucketDeRescate = "A_sellada_con_doc" | "B_sin_doc" | "C_transcript_basura" | "D_sellada_antes_de_terminar";

export interface FilaCandidata {
  enrichedAt: Date | null;
  transcript: string | null;
  googleDocId: string | null;
  organizerEmail: string | null;
  participants: readonly string[];
  date: Date;
  /** Minutos del evento. Sin ella (filas de antes), el bucket D no se evalúa. */
  duration?: number | null;
}

/**
 * PURA. `null` = no se rescata. El orden de las reglas ES el criterio:
 *
 *  1. Basura primero: un transcript <200 chars es mentira aunque la fila esté "sana".
 *  2. Solo filas SELLADAS: una fila pendiente ya la van a tomar las pasadas o el job —
 *     resetearla no agrega nada y rompería la idempotencia del script.
 *  3. Con doc → A, siempre: re-leer un doc existente nunca está de más.
 *  4. Sin doc → B solo si el pipeline NUEVO puede hacer algo que el viejo no pudo:
 *     · la sesión aún no ocurrió (se selló ANTES de la reunión — hoy viola INV16(a); se
 *       resetea para que el pipeline la procese A SU HORA), o
 *     · el organizador era INIMPERSONABLE (cliente/sala/nulo) y hay un participante interno
 *       — es lo que el fallback de R3 destraba (~267 medidas).
 *     ⚠ Una sesión pasada con organizador NUESTRO ya se buscó bien en Drive y no tenía
 *     nada: re-buscarla es churn puro contra la API (el primer dry-run daba 3.620 filas en
 *     B por incluirlas — se cazó mirando los conteos, no la teoría). Y una pasada, sin doc
 *     y 100% externa es ilegible por diseño: se queda sellada.
 */
export function bucketDe(f: FilaCandidata, ahora: Date): BucketDeRescate | null {
  const transcriptBasura =
    f.transcript !== null && f.transcript.trim().length < MIN_TRANSCRIPT_CHARS;
  if (transcriptBasura) return "C_transcript_basura";

  if (f.enrichedAt === null) return null;
  if (f.transcript !== null) return null; // transcript sano: nada que rescatar

  // D antes que A: es el subconjunto que se sabe por qué quedó vacío (se leyó antes de que terminara).
  if (f.duration != null && f.duration > 0 && f.date.getTime() <= ahora.getTime() && elegirImpersonado(f.organizerEmail, f.participants) !== null) {
    const listaDesde = finDeLaReunion({ date: f.date, duration: f.duration }).getTime() + MARGEN_TRAS_EL_FIN_MS;
    if (f.enrichedAt.getTime() < listaDesde) return "D_sellada_antes_de_terminar";
  }

  if (f.googleDocId !== null) return "A_sellada_con_doc";

  const esFutura = f.date.getTime() > ahora.getTime();
  if (esFutura) return "B_sin_doc";

  // El organizador solo, sin mirar participantes: ¿el pipeline VIEJO podía leerla?
  const organizadorImpersonable = elegirImpersonado(f.organizerEmail, []) !== null;
  if (!organizadorImpersonable && elegirImpersonado(f.organizerEmail, f.participants) !== null) {
    return "B_sin_doc";
  }
  return null;
}

/** Qué escribe el rescate por bucket. El reset repone la fila al estado «nunca intentada». */
export function datosDeReset(bucket: BucketDeRescate): {
  enrichedAt: null;
  enrichAttempts: 0;
  enrichError: null;
  transcript?: null;
} {
  const base = { enrichedAt: null as null, enrichAttempts: 0 as const, enrichError: null as null };
  // ⚠ Solo el bucket C limpia el transcript (es basura). A y B no tienen transcript que
  // limpiar, y summary/minutas no se tocan NUNCA — ver la cabecera.
  return bucket === "C_transcript_basura" ? { ...base, transcript: null } : base;
}

/**
 * `--dias N` o `--dias=N` del rescate (U1, 2026-10-25). Sin el flag, null (toda la historia). Mal escrito es un ERROR y
 * el script aborta: perderlo en silencio rescataba toda la historia (950 filas) en vez de las 177 de los últimos 90 días.
 */
export function diasDelRescate(argv: readonly string[]): { dias: number | null } | { error: string } {
  const conIgual = argv.find((a) => a.startsWith("--dias="));
  const i = argv.indexOf("--dias");
  if (!conIgual && i < 0) return { dias: null };
  const crudo = conIgual ? conIgual.slice("--dias=".length) : (argv[i + 1] ?? "");
  const n = Number(crudo);
  if (!/^\d+$/.test(crudo) || !Number.isSafeInteger(n) || n <= 0) {
    return { error: `--dias necesita un número de días mayor que cero (llegó «${crudo}»)` };
  }
  return { dias: n };
}

/** Los recortes del rescate sobre UNA fila. `duena` = `duenoDeLaSesion(fila)`; `deEmpresa` = clientes y prospectos. */
export function entraEnElRecorte(
  f: { date: Date; duena: string | null },
  ahora: Date,
  r: { soloFuturas: boolean; soloClientesYProspectos: boolean; deEmpresa: ReadonlySet<string> },
): boolean {
  if (r.soloFuturas && f.date.getTime() <= ahora.getTime()) return false;
  if (r.soloClientesYProspectos && (!f.duena || !r.deEmpresa.has(f.duena))) return false;
  return true;
}
