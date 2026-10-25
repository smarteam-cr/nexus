/**
 * lib/google/eventos-de-meet.ts — enterarse al momento de lo que pasa en Meet (U4, 2026-10-25): una conferencia que
 * terminó, una transcripción o unas notas que quedaron listas. Sin esto, Nexus se entera con la revisión de cada 10
 * minutos (lib/google/conferencias-por-job.ts), que sigue siendo la red: un aviso perdido solo atrasa.
 *
 * Dos piezas:
 *   1. **Las suscripciones** (API de Workspace Events): una por persona del equipo, sobre
 *      `//cloudidentity.googleapis.com/users/{id}` (todas las reuniones que organiza). Se crean impersonando a esa
 *      persona con el permiso de Meet (U2 probó que la delegación de dominio se acepta). Sin los datos de la reunión en
 *      el aviso, duran 7 días: el job diario `google-meet-suscripciones` crea las que faltan, renueva las que vencen en
 *      menos de 2 días y reactiva las suspendidas.
 *   2. **Los avisos** (Pub/Sub, suscripción pull `nexus-meet-eventos-pull` del tema `nexus-meet-eventos`): el job
 *      `google-meet-eventos` los lee cada minuto como la cuenta de servicio, y si llegó alguno lanza la revisión urgente
 *      de las conferencias (las de las últimas 12 horas). Los confirma siempre: la revisión tiene su propia red, y un
 *      aviso que no se entiende no tiene por qué volver.
 *
 * Los dos jobs nacen APAGADOS (`GOOGLE_MEET_EVENTOS_ENABLED=1` los prende, lib/jobs/requisitos.ts): crean cosas en
 * Google y conviene prenderlos después de ver la revisión de cada 10 minutos andando. La base local no los corre: no
 * tiene las credenciales de Google (scripts/dev-local.ts).
 */
import { getMeetAuth, getPubSubAuth, listDomainUsers, proyectoDeGoogleCloud } from "./auth";

export const TEMA = "nexus-meet-eventos";
export const SUSCRIPCION_PULL = "nexus-meet-eventos-pull";
export const TIPOS_DE_EVENTO = [
  "google.workspace.meet.conference.v2.ended",
  "google.workspace.meet.transcript.v2.fileGenerated",
  "google.workspace.meet.smartNote.v2.fileGenerated",
] as const;
/** Se renueva la suscripción que vence en menos de esto. */
export const RENOVAR_ANTES_MS = 2 * 86_400_000;
const EVENTS = "https://workspaceevents.googleapis.com/v1";
/**
 * Tope de cada pedido. ⚠ El job de los avisos corre DENTRO del tick, y el scheduler corre los jobs en serie: un pedido
 * colgado a Pub/Sub atrasaría a todos los que vienen detrás. Con el tope, como mucho 10 segundos por tick.
 */
const TIEMPO_MAXIMO_MS = 10_000;

type Json = Record<string, unknown>;

// ── Las suscripciones ─────────────────────────────────────────────────────────

export interface SuscripcionVista {
  nombre: string;
  objetivo: string;
  /** ACTIVE | SUSPENDED | DELETED. */
  estado: string;
  vence: Date | null;
}

export type QueHacer = "crear" | "renovar" | "reactivar" | "nada";

/** PURA. Qué hacer con la suscripción de una persona. */
export function queHacerConLaSuscripcion(s: SuscripcionVista | null, ahora: Date): QueHacer {
  if (!s || s.estado === "DELETED") return "crear";
  if (s.estado === "SUSPENDED") return "reactivar";
  if (!s.vence || s.vence.getTime() - ahora.getTime() < RENOVAR_ANTES_MS) return "renovar";
  return "nada";
}

export const objetivoDe = (idDeUsuario: string) => `//cloudidentity.googleapis.com/users/${idDeUsuario}`;

function errorDe(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  return `${err.response?.status ?? "—"} ${err.response?.data?.error?.message ?? err.message ?? String(e)}`;
}

async function suscripcionesDe(correo: string): Promise<SuscripcionVista[]> {
  const filtro = encodeURIComponent(`event_types:"${TIPOS_DE_EVENTO[0]}"`);
  const r = await getMeetAuth(correo).request<Json>({ url: `${EVENTS}/subscriptions?filter=${filtro}`, method: "GET", timeout: TIEMPO_MAXIMO_MS });
  return ((r.data.subscriptions as Json[] | undefined) ?? []).map((s) => ({
    nombre: String(s.name ?? ""),
    objetivo: String(s.targetResource ?? ""),
    estado: String(s.state ?? ""),
    vence: typeof s.expireTime === "string" ? new Date(s.expireTime) : null,
  }));
}

export interface ResultadoDeSuscripciones {
  personas: number;
  creadas: number;
  renovadas: number;
  reactivadas: number;
  fallaron: string[];
}

/** Crea, renueva o reactiva la suscripción de cada persona del equipo. Una persona que falla no frena a las demás. */
export async function asegurarSuscripciones(ahora: Date = new Date()): Promise<ResultadoDeSuscripciones> {
  const proyecto = proyectoDeGoogleCloud();
  if (!proyecto) throw new Error("La clave de la cuenta de servicio no trae project_id");
  const usuarios = (await listDomainUsers()).filter((u) => u.id);
  const r: ResultadoDeSuscripciones = { personas: usuarios.length, creadas: 0, renovadas: 0, reactivadas: 0, fallaron: [] };
  for (const u of usuarios) {
    try {
      const objetivo = objetivoDe(u.id!);
      const suya = (await suscripcionesDe(u.email)).find((s) => s.objetivo === objetivo) ?? null;
      const accion = queHacerConLaSuscripcion(suya, ahora);
      const auth = getMeetAuth(u.email);
      if (accion === "crear") {
        await auth.request({
          url: `${EVENTS}/subscriptions`,
          method: "POST",
          timeout: TIEMPO_MAXIMO_MS,
          data: {
            targetResource: objetivo,
            eventTypes: [...TIPOS_DE_EVENTO],
            notificationEndpoint: { pubsubTopic: `projects/${proyecto}/topics/${TEMA}` },
            payloadOptions: { includeResource: false },
          },
        });
        r.creadas++;
      } else if (accion === "renovar") {
        // ttl 0 = la duración máxima (7 días sin los datos de la reunión en el aviso).
        await auth.request({ url: `${EVENTS}/${suya!.nombre}?updateMask=ttl`, method: "PATCH", data: { ttl: "0s" }, timeout: TIEMPO_MAXIMO_MS });
        r.renovadas++;
      } else if (accion === "reactivar") {
        await auth.request({ url: `${EVENTS}/${suya!.nombre}:reactivate`, method: "POST", data: {}, timeout: TIEMPO_MAXIMO_MS });
        r.reactivadas++;
      }
    } catch (e) {
      r.fallaron.push(`${u.email}: ${errorDe(e)}`);
    }
  }
  return r;
}

// ── Los avisos ────────────────────────────────────────────────────────────────

export interface AvisoDeMeet {
  /** El tipo del evento (`ce-type`): conferencia terminada, transcripción o notas listas. */
  tipo: string;
  /** `conferenceRecords/{id}`, si el aviso lo trae. */
  conferencia: string | null;
}

/** PURA. Lo que dice un mensaje de Pub/Sub de Workspace Events: el tipo en los atributos, el recurso en los datos. */
export function avisoDelMensaje(atributos: Record<string, string> | undefined, datosBase64: string | undefined): AvisoDeMeet {
  const tipo = atributos?.["ce-type"] ?? "desconocido";
  let crudo = atributos?.["ce-subject"] ?? "";
  if (datosBase64) {
    try {
      crudo += " " + Buffer.from(datosBase64, "base64").toString("utf8");
    } catch {
      /* datos ilegibles: queda lo de los atributos */
    }
  }
  const m = /conferenceRecords\/[A-Za-z0-9_-]+/.exec(crudo);
  return { tipo, conferencia: m ? m[0] : null };
}

/** Lee hasta `max` avisos y los confirma. Vacío si no llegó nada. */
export async function leerAvisos(max = 50): Promise<AvisoDeMeet[]> {
  const proyecto = proyectoDeGoogleCloud();
  if (!proyecto) throw new Error("La clave de la cuenta de servicio no trae project_id");
  const base = `https://pubsub.googleapis.com/v1/projects/${proyecto}/subscriptions/${SUSCRIPCION_PULL}`;
  const auth = getPubSubAuth();
  // `returnImmediately`: sin avisos vuelve enseguida en vez de esperar a que llegue alguno (el tick no puede quedarse).
  const r = await auth.request<Json>({ url: `${base}:pull`, method: "POST", data: { maxMessages: max, returnImmediately: true }, timeout: TIEMPO_MAXIMO_MS });
  const recibidos = (r.data.receivedMessages as Json[] | undefined) ?? [];
  if (recibidos.length === 0) return [];
  const avisos = recibidos.map((m) => {
    const msg = (m.message as Json | undefined) ?? {};
    return avisoDelMensaje(msg.attributes as Record<string, string> | undefined, typeof msg.data === "string" ? msg.data : undefined);
  });
  const ackIds = recibidos.map((m) => m.ackId).filter((x): x is string => typeof x === "string");
  if (ackIds.length > 0) await auth.request({ url: `${base}:acknowledge`, method: "POST", data: { ackIds }, timeout: TIEMPO_MAXIMO_MS });
  return avisos;
}
