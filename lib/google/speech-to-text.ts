/**
 * lib/google/speech-to-text.ts — el audio de una reunión presencial: Cloud Storage + Speech-to-Text de Google (T5,
 * 2026-10-25). SERVIDOR. La única puerta de Nexus a esas dos APIs (ARCHITECTURE §7: nada de HTTP a Google fuera de
 * lib/google). La usa lib/sessions/audio-de-reunion-server.ts; las reglas (formatos, tope, bandera) viven en
 * lib/sessions/audio-de-reunion.ts.
 *
 * Con la MISMA cuenta de servicio de siempre (`GOOGLE_SERVICE_ACCOUNT_KEY`), pero SIN suplantar a nadie: el bucket y el
 * reconocimiento son del proyecto de Google Cloud de esa cuenta, no del Workspace. Lo que Elías habilita (RUNBOOK y el
 * resumen de T5): la API «Cloud Speech-to-Text», un bucket con CORS para el origen de Nexus, y a la cuenta de servicio
 * los roles «Storage Object Admin» sobre el bucket y «Cloud Speech Client» en el proyecto.
 *
 *   GOOGLE_SPEECH_BUCKET   el bucket (sin «gs://»). Obligatoria.
 *   GOOGLE_SPEECH_REGION   dónde corre el reconocimiento; «global» por defecto (el modelo «long»).
 *   GOOGLE_SPEECH_PROJECT  el proyecto; por defecto el `project_id` de la clave.
 */
import "server-only";
import { JWT } from "google-auth-library";

const ALCANCE = ["https://www.googleapis.com/auth/cloud-platform"];
/** El idioma del reconocimiento: el español que Speech-to-Text reconoce con el modelo «long» para América. */
const IDIOMA = "es-US";

interface Clave {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function clave(): Clave {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("[google/speech] GOOGLE_SERVICE_ACCOUNT_KEY no configurada");
  const k = JSON.parse(raw) as Partial<Clave>;
  if (!k.client_email || !k.private_key) throw new Error("[google/speech] la clave de la cuenta de servicio no trae client_email o private_key");
  return { client_email: k.client_email, private_key: k.private_key, project_id: k.project_id };
}

let cliente: JWT | null = null;
async function encabezados(): Promise<Record<string, string>> {
  if (!cliente) {
    const k = clave();
    cliente = new JWT({ email: k.client_email, key: k.private_key, scopes: ALCANCE });
  }
  const { token } = await cliente.getAccessToken();
  if (!token) throw new Error("[google/speech] Google no dio un token para la cuenta de servicio");
  return { Authorization: `Bearer ${token}` };
}

function bucket(): string {
  const b = process.env.GOOGLE_SPEECH_BUCKET?.trim().replace(/^gs:\/\//, "").replace(/\/+$/, "");
  if (!b) throw new Error("[google/speech] GOOGLE_SPEECH_BUCKET no configurada");
  return b;
}

function proyecto(): string {
  const p = process.env.GOOGLE_SPEECH_PROJECT?.trim() || clave().project_id;
  if (!p) throw new Error("[google/speech] falta GOOGLE_SPEECH_PROJECT (la clave no trae project_id)");
  return p;
}

function region(): string {
  return process.env.GOOGLE_SPEECH_REGION?.trim() || "global";
}

function baseDeSpeech(): string {
  const r = region();
  return r === "global" ? "https://speech.googleapis.com" : `https://${r}-speech.googleapis.com`;
}

/** Un error de Google, corto y sin el cuerpo entero (puede traer datos). */
async function errorDe(res: Response, que: string): Promise<Error> {
  const cuerpo = await res.text().catch(() => "");
  let mensaje = "";
  try {
    mensaje = (JSON.parse(cuerpo) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    /* no era JSON */
  }
  return new Error(`[google/speech] ${que}: ${res.status}${mensaje ? ` ${mensaje.slice(0, 300)}` : ""}`);
}

/** La ruta completa del objeto («gs://bucket/objeto»). */
export function uriDelObjeto(objeto: string): string {
  return `gs://${bucket()}/${objeto}`;
}

/**
 * Abre una subida reanudable a Cloud Storage y devuelve la dirección a la que el NAVEGADOR sube el archivo con un PUT.
 * `origen` es el de Nexus (`APP_URL`): Google responde a ese origen con los permisos de CORS de la subida.
 */
export async function abrirSubidaDelAudio(o: { objeto: string; tipo: string; bytes: number; origen: string }): Promise<string> {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket())}/o?uploadType=resumable&name=${encodeURIComponent(o.objeto)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(await encabezados()),
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": o.tipo || "application/octet-stream",
      "X-Upload-Content-Length": String(o.bytes),
      Origin: o.origen,
    },
    body: JSON.stringify({ contentType: o.tipo || "application/octet-stream" }),
  });
  if (!res.ok) throw await errorDe(res, "no se pudo abrir la subida");
  const destino = res.headers.get("location");
  if (!destino) throw new Error("[google/speech] Cloud Storage no devolvió la dirección de la subida");
  return destino;
}

/** El tamaño del objeto si ya está en el bucket (la subida terminó), o null. */
export async function tamanoDelObjeto(objeto: string): Promise<number | null> {
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket())}/o/${encodeURIComponent(objeto)}`, {
    headers: await encabezados(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await errorDe(res, "no se pudo mirar el audio en el bucket");
  const j = (await res.json()) as { size?: string };
  return j.size ? Number(j.size) : null;
}

/** Borra el objeto del bucket (ya está transcrito). Un 404 es «ya no estaba». */
export async function borrarObjetoDelAudio(objeto: string): Promise<void> {
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket())}/o/${encodeURIComponent(objeto)}`, {
    method: "DELETE",
    headers: await encabezados(),
  });
  if (!res.ok && res.status !== 404) throw await errorDe(res, "no se pudo borrar el audio del bucket");
}

/** Pide la transcripción en lote del audio. Devuelve el nombre de la operación (se mira con `leerTranscripcion`). */
export async function pedirTranscripcion(objeto: string): Promise<string> {
  const recognizer = `projects/${proyecto()}/locations/${region()}/recognizers/_`;
  const res = await fetch(`${baseDeSpeech()}/v2/${recognizer}:batchRecognize`, {
    method: "POST",
    headers: { ...(await encabezados()), "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      config: {
        autoDecodingConfig: {},
        model: "long",
        languageCodes: [IDIOMA],
        features: { enableAutomaticPunctuation: true },
      },
      files: [{ uri: uriDelObjeto(objeto) }],
      recognitionOutputConfig: { inlineResponseConfig: {} },
    }),
  });
  if (!res.ok) throw await errorDe(res, "Speech-to-Text no aceptó el audio");
  const op = (await res.json()) as { name?: string };
  if (!op.name) throw new Error("[google/speech] Speech-to-Text no devolvió la operación");
  return op.name;
}

export type EstadoDeLaTranscripcion =
  | { listo: false }
  | { listo: true; ok: true; pedazos: string[]; minutos: number | null }
  | { listo: true; ok: false; error: string };

/** Los segundos de «123.5s», o null. */
function segundos(d: unknown): number | null {
  if (typeof d !== "string") return null;
  const n = Number.parseFloat(d.replace(/s$/, ""));
  return Number.isFinite(n) ? n : null;
}

/** PURA (exportada para la prueba). Lo que dice una operación de `batchRecognize` terminada. */
export function leerOperacion(op: {
  done?: boolean;
  error?: { message?: string };
  response?: { results?: Record<string, { error?: { message?: string }; inlineResult?: { transcript?: { results?: { alternatives?: { transcript?: string }[] }[] } }; metadata?: { totalBilledDuration?: string } }>; totalBilledDuration?: string };
}): EstadoDeLaTranscripcion {
  if (!op.done) return { listo: false };
  if (op.error) return { listo: true, ok: false, error: op.error.message?.slice(0, 300) || "la operación falló" };
  const archivos = Object.values(op.response?.results ?? {});
  const primero = archivos[0];
  if (!primero) return { listo: true, ok: false, error: "Speech-to-Text no devolvió resultado" };
  if (primero.error?.message) return { listo: true, ok: false, error: primero.error.message.slice(0, 300) };
  const pedazos = (primero.inlineResult?.transcript?.results ?? []).map((r) => r.alternatives?.[0]?.transcript ?? "");
  const s = segundos(primero.metadata?.totalBilledDuration) ?? segundos(op.response?.totalBilledDuration);
  return { listo: true, ok: true, pedazos, minutos: s === null ? null : s / 60 };
}

/** Mira la operación de la transcripción. */
export async function leerTranscripcion(operacion: string): Promise<EstadoDeLaTranscripcion> {
  const res = await fetch(`${baseDeSpeech()}/v2/${operacion}`, { headers: await encabezados() });
  if (!res.ok) throw await errorDe(res, "no se pudo mirar la transcripción");
  return leerOperacion((await res.json()) as Parameters<typeof leerOperacion>[0]);
}
