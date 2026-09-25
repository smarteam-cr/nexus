/**
 * lib/timeline/autoria-de-la-propuesta.ts — QUIÉN dejó la propuesta del cronograma, CUÁNDO y DE
 * DÓNDE viene (E2b P7). Puro y sin Prisma: lo arma el servidor (`leer-autoria.ts`) y lo pintan la
 * barra, el cartel (ficha y GPS) y «Qué hacer acá».
 *
 *   · de dónde: UNA sola clasificación (`deDondeViene`, borrador.ts), la misma de la barra y de la
 *     auditoría de aplicar;
 *   · quién y cuándo: la corrida del TOKEN (`pendingProposalRunId`), el que lanzó el handoff o
 *     «Regenerar». Sin email no se dice nadie: nunca «el sistema»;
 *   · la fecha va en hora de Costa Rica (UTC−6 fijo, sin horario de verano) y SIN `Intl`: el servidor
 *     y el navegador dicen el mismo día, sin depender de la zona ni del idioma de ninguno de los dos.
 */
import { deDondeViene, desdeDeLaPropuesta } from "./borrador";

export interface AutoriaDeLaPropuesta {
  /** «desde …» (`desdeDeLaPropuesta`). */
  desde: string;
  /** El nombre de quien lanzó la corrida (o su email si no es del equipo). null = no se sabe. */
  quien: string | null;
  /** Cuándo empezó esa corrida, en ISO. null = no se encontró la corrida. */
  cuando: string | null;
}

/** La corrida del token, como la lee el servidor. */
export interface CorridaDeLaPropuesta {
  createdAt: Date | string;
  triggeredByEmail: string | null;
}

const texto = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** Una fecha válida en ISO, o null. */
function aIso(v: Date | string): string | null {
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** De dónde, quién y cuándo, de lo guardado y de su corrida. `nombre` = el `TeamMember.name` del email. */
export function autoriaDeLaPropuesta(i: {
  guardado: unknown;
  corrida: CorridaDeLaPropuesta | null;
  nombre: string | null;
}): AutoriaDeLaPropuesta {
  const desde = desdeDeLaPropuesta(deDondeViene(i.guardado));
  if (!i.corrida) return { desde, quien: null, cuando: null };
  const email = texto(i.corrida.triggeredByEmail);
  return { desde, quien: email ? (texto(i.nombre) ?? email) : null, cuando: aIso(i.corrida.createdAt) };
}

/** Lo que llega por el cable, validado. null = no vino o no tiene la forma. */
export function leerAutoria(json: unknown): AutoriaDeLaPropuesta | null {
  if (typeof json !== "object" || json === null) return null;
  const o = json as Record<string, unknown>;
  if (typeof o.desde !== "string" || !o.desde.startsWith("desde ") || o.desde.length > 500) return null;
  const quien = typeof o.quien === "string" && o.quien.length <= 200 ? texto(o.quien) : null;
  const cuando = typeof o.cuando === "string" ? aIso(o.cuando) : null;
  return { desde: o.desde, quien, cuando };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
/** Costa Rica: UTC−6 todo el año. */
const DESFASE_CR_MS = 6 * 60 * 60 * 1000;

/** «24 sep»: el día en hora de Costa Rica. "" si la fecha no es válida. */
export function diaCorto(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const cr = new Date(ms - DESFASE_CR_MS);
  return `${cr.getUTCDate()} ${MESES[cr.getUTCMonth()]}`;
}

/**
 * La frase de la barra y los carteles:
 *   · con quién y cuándo → «desde «Regenerar todo» · la dejó Ana López el 24 sep»;
 *   · solo cuándo → «desde el handoff del 11 jul»;
 *   · ninguno → «desde el handoff».
 */
export function fraseDeAutoria(a: AutoriaDeLaPropuesta): string {
  const dia = a.cuando ? diaCorto(a.cuando) : "";
  if (a.quien) return dia ? `${a.desde} · la dejó ${a.quien} el ${dia}` : `${a.desde} · la dejó ${a.quien}`;
  return dia ? `${a.desde} del ${dia}` : a.desde;
}
