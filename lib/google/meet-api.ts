/**
 * lib/google/meet-api.ts — la API REST de Meet (`conferenceRecords`), con tipos propios (ARCHITECTURE §7 regla 5: no se
 * devuelven los tipos crudos de Google). U3, 2026-10-25.
 *
 * Va por `auth.request` y no por el cliente de googleapis: es un puñado de GET paginados, y así no se carga otra API
 * entera al proceso (lib/google/googleapis-sin-raiz.test.ts). El permiso es `meetings.space.readonly`, en su propio JWT
 * (`getMeetAuth`): si Admin lo quita, falla solo esto, no Calendar ni Drive.
 *
 * Lo que se aprendió en U2 (docs/integracion-google-plan.md):
 *   · el filtro por código (`space.meeting_code`) trae TODAS las conferencias del espacio: una serie semanal trae las de
 *     cada semana, y una misma reunión puede tener dos (alguien salió y volvió). Elegir cuáles son de qué reunión lo
 *     decide lib/google/conferencias-reglas.ts;
 *   · quien entró viene como `users/{id}`, no por su correo;
 *   · las frases vienen en `transcriptEntries`, de a 100 por página.
 */
import { getMeetAuth } from "./auth";

const MEET = "https://meet.googleapis.com/v2";
/** Tope de páginas por lista: 50 × 100 = 5.000 frases (una reunión de 3 horas trae unas 1.000). */
const MAX_PAGINAS = 50;
/** Tope de cada pedido: una API colgada no deja la corrida esperando para siempre. */
const TIEMPO_MAXIMO_MS = 30_000;

export interface RegistroDeConferencia {
  /** `conferenceRecords/{id}`. */
  nombre: string;
  inicio: Date;
  /** null = sigue en curso. */
  fin: Date | null;
}

export interface ParticipanteDeMeet {
  /** `conferenceRecords/{id}/participants/{id}`. */
  nombre: string;
  /** Con el que entró. */
  mostrado: string;
  /** `users/{id}` si entró con una cuenta de Google; null si anónimo o por teléfono. */
  usuario: string | null;
  tipo: "cuenta" | "anonimo" | "telefono";
  primeraEntrada: Date | null;
  ultimaSalida: Date | null;
}

export interface SesionDeParticipante {
  inicio: Date | null;
  fin: Date | null;
}

export interface TranscripcionDeMeet {
  nombre: string;
  /** STARTED | ENDED | FILE_GENERATED. */
  estado: string;
  docId: string | null;
}

export interface NotasDeMeet {
  nombre: string;
  estado: string;
  docId: string | null;
}

export interface FraseDeMeet {
  /** El participante que la dijo (`conferenceRecords/{id}/participants/{id}`). */
  participante: string;
  inicio: Date;
  fin: Date | null;
  texto: string;
  idioma: string | null;
}

/** Un error de la API con su status, para decidir si probar con otra cuenta (403/404) o reintentar después (429/5xx). */
export class ErrorDeMeet extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ErrorDeMeet";
  }
}

type Json = Record<string, unknown>;

async function pedir(correo: string, url: string): Promise<Json> {
  try {
    const r = await getMeetAuth(correo).request<Json>({ url, method: "GET", timeout: TIEMPO_MAXIMO_MS });
    return r.data ?? {};
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
    const status = err.response?.status ?? null;
    throw new ErrorDeMeet(err.response?.data?.error?.message ?? err.message ?? String(e), status);
  }
}

/** Todas las páginas de una lista. */
async function todas(correo: string, url: string, clave: string): Promise<Json[]> {
  const out: Json[] = [];
  let token = "";
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const sep = url.includes("?") ? "&" : "?";
    const data = await pedir(correo, `${url}${sep}pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    out.push(...((data[clave] as Json[] | undefined) ?? []));
    token = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
    if (!token) break;
  }
  return out;
}

const fecha = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/** Las conferencias de un código de reunión que ve esa cuenta (como organizadora, o porque entró). */
export async function conferenciasDelCodigo(correo: string, codigo: string): Promise<RegistroDeConferencia[]> {
  const filtro = encodeURIComponent(`space.meeting_code = "${codigo.replace(/"/g, "")}"`);
  const filas = await todas(correo, `${MEET}/conferenceRecords?filter=${filtro}`, "conferenceRecords");
  const out: RegistroDeConferencia[] = [];
  for (const f of filas) {
    const inicio = fecha(f.startTime);
    if (!f.name || !inicio) continue;
    out.push({ nombre: texto(f.name), inicio, fin: fecha(f.endTime) });
  }
  return out;
}

export async function participantesDe(correo: string, registro: string): Promise<ParticipanteDeMeet[]> {
  const filas = await todas(correo, `${MEET}/${registro}/participants`, "participants");
  return filas
    .filter((f) => typeof f.name === "string")
    .map((f) => {
      const cuenta = f.signedinUser as Json | undefined;
      const anonimo = f.anonymousUser as Json | undefined;
      const telefono = f.phoneUser as Json | undefined;
      const tipo: ParticipanteDeMeet["tipo"] = cuenta ? "cuenta" : telefono ? "telefono" : "anonimo";
      const mostrado = texto(cuenta?.displayName ?? anonimo?.displayName ?? telefono?.displayName) || "Sin nombre";
      return {
        nombre: texto(f.name),
        mostrado,
        usuario: cuenta && typeof cuenta.user === "string" ? cuenta.user : null,
        tipo,
        primeraEntrada: fecha(f.earliestStartTime),
        ultimaSalida: fecha(f.latestEndTime),
      };
    });
}

export async function sesionesDe(correo: string, participante: string): Promise<SesionDeParticipante[]> {
  const filas = await todas(correo, `${MEET}/${participante}/participantSessions`, "participantSessions");
  return filas.map((f) => ({ inicio: fecha(f.startTime), fin: fecha(f.endTime) }));
}

export async function transcripcionesDe(correo: string, registro: string): Promise<TranscripcionDeMeet[]> {
  const filas = await todas(correo, `${MEET}/${registro}/transcripts`, "transcripts");
  return filas.map((f) => ({
    nombre: texto(f.name),
    estado: texto(f.state),
    docId: texto((f.docsDestination as Json | undefined)?.document) || null,
  }));
}

/** Las notas de Gemini de la conferencia. Si la API todavía no las da para la cuenta, vuelve vacío: no son esenciales. */
export async function notasDe(correo: string, registro: string): Promise<NotasDeMeet[]> {
  try {
    const filas = await todas(correo, `${MEET}/${registro}/smartNotes`, "smartNotes");
    return filas.map((f) => ({
      nombre: texto(f.name),
      estado: texto(f.state),
      docId: texto((f.docsDestination as Json | undefined)?.document) || null,
    }));
  } catch (e) {
    if (e instanceof ErrorDeMeet && (e.status === 404 || e.status === 400 || e.status === 403)) return [];
    throw e;
  }
}

export async function frasesDe(correo: string, transcripcion: string): Promise<FraseDeMeet[]> {
  const filas = await todas(correo, `${MEET}/${transcripcion}/entries`, "transcriptEntries");
  const out: FraseDeMeet[] = [];
  for (const f of filas) {
    const inicio = fecha(f.startTime);
    const dicho = texto(f.text).trim();
    if (!inicio || !dicho) continue;
    out.push({ participante: texto(f.participant), inicio, fin: fecha(f.endTime), texto: dicho, idioma: texto(f.languageCode) || null });
  }
  return out;
}
