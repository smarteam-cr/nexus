/**
 * lib/ventas/sicop-archivos.ts — BAJAR EL CARTEL Y CONVERTIRLO EN TEXTO.
 *
 * El cartel de una licitación no llega como prosa: llega como un PDF colgado de una nota.
 * Medido el 2026-08-23 sobre «Gobiernos»: de 58 notas, 33 llevan archivo y 30 no tienen una
 * sola letra de texto. Hasta ahora la IA leía el título y se quedaba con la confianza en 22
 * de 100, que es lo correcto pero no alcanza para decidir.
 *
 * El camino es: `hs_attachment_ids` → fila en `SicopAdjunto` → metadatos → URL firmada →
 * descarga en memoria → `extractText()` → se guarda SOLO el texto.
 *
 * ── TRES COSAS QUE NO SON DETALLE ────────────────────────────────────────────
 *
 * ⛔ EL BINARIO NO SE GUARDA. El archivo ya vive en HubSpot y ese es su lugar (decisión de
 * Elías). Acá se baja a memoria, se extrae y se tira.
 *
 * ⚠ HOY NO HAY PERMISO. Verificado el 2026-08-23: `/files/v3/*` devuelve 403 MISSING_SCOPES
 * pidiendo `files` · `files.read` · `files.ui_hidden.read`, y ninguno está entre los 32 scopes
 * de la app. `sincronizarAdjuntos` funciona igual —la fila se crea con lo que se sabe desde el
 * ticket— y el intento de leerla queda en `SIN_PERMISO`. La pantalla cuenta los archivos y
 * dice qué falta; el día que se autorice, la misma corrida los completa sin tocar código.
 *
 * ⚠ SIN_TEXTO NO ES UN ERROR. Es el caso normal de un cartel escaneado: se bajó bien y no hay
 * nada que extraer sin OCR. Tratarlo como fallo haría que «la mitad necesita OCR» se leyera
 * como «la integración está rota», que manda a arreglar lo que no está roto.
 */
import type { Client as HsClient } from "@hubspot/api-client";
import type { SicopAdjuntoEstado } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { extractText } from "@/lib/documents/extract-text";
import { idsDeAdjuntos, type NotaCruda } from "./sicop";

/**
 * Tope de descarga. Los carteles del Estado rondan 1-5 MB; 20 MB deja margen para un anexo
 * gordo sin que un archivo suelto se coma la memoria del server.
 */
export const MAX_BYTES_ADJUNTO = 20 * 1024 * 1024;

/* El parseo de `hs_attachment_ids` vive en `sicop.ts` —que es quien habla con la API de
   notas— y se re-exporta acá para que quien trabaje con archivos lo encuentre a mano. */
export { idsDeAdjuntos };

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface AdjuntoDeLicitacion {
  id: string;
  hubspotTicketId: string;
  hubspotNoteId: string;
  hubspotFileId: string;
  nombre: string | null;
  extension: string | null;
  mimeType: string | null;
  tamanoBytes: number | null;
  urlHubspot: string | null;
  estado: SicopAdjuntoEstado;
  caracteres: number;
  error: string | null;
  extraidoEl: string | null;
}

/** Igual que el anterior pero CON el texto — solo lo pide el armador del prompt. */
export interface AdjuntoConTexto extends AdjuntoDeLicitacion {
  texto: string | null;
}

// ── Sincronización de filas (FUNCIONA SIN EL SCOPE) ────────────────────────────

export interface ResultadoSincronizacion {
  creados: number;
  yaEstaban: number;
  esquemaAtrasado: boolean;
}

/**
 * Crea la fila de cada archivo que cuelga de las notas dadas. No baja nada: solo registra que
 * el archivo EXISTE, que es lo que la pantalla necesita para poder contarlo.
 *
 * Idempotente: re-sincronizar no duplica ni pisa el texto ya extraído.
 */
export async function sincronizarAdjuntos(
  notasPorTicket: ReadonlyMap<string, readonly NotaCruda[]>,
): Promise<ResultadoSincronizacion> {
  const filas: { hubspotTicketId: string; hubspotNoteId: string; hubspotFileId: string }[] = [];
  for (const [ticketId, notas] of notasPorTicket) {
    for (const nota of notas) {
      for (const fileId of nota.idsDeArchivos ?? []) {
        filas.push({ hubspotTicketId: ticketId, hubspotNoteId: nota.id, hubspotFileId: fileId });
      }
    }
  }
  if (filas.length === 0) return { creados: 0, yaEstaban: 0, esquemaAtrasado: false };

  try {
    /* `skipDuplicates` sobre el único (ticket, archivo): el que ya está conserva su texto y su
       estado. Re-sincronizar después de una corrida NO borra el trabajo hecho. */
    const r = await prisma.sicopAdjunto.createMany({ data: filas, skipDuplicates: true });
    return { creados: r.count, yaEstaban: filas.length - r.count, esquemaAtrasado: false };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { creados: 0, yaEstaban: 0, esquemaAtrasado: true };
    throw e;
  }
}

// ── Lectura de lo guardado ─────────────────────────────────────────────────────

export interface AdjuntosGuardados {
  /** ticketId → sus archivos. */
  porTicket: Map<string, AdjuntoDeLicitacion[]>;
  esquemaAtrasado: boolean;
}

const SIN_TEXTO = {
  id: true,
  hubspotTicketId: true,
  hubspotNoteId: true,
  hubspotFileId: true,
  nombre: true,
  extension: true,
  mimeType: true,
  tamanoBytes: true,
  urlHubspot: true,
  estado: true,
  caracteres: true,
  error: true,
  extraidoEl: true,
} as const;

export async function leerAdjuntosGuardados(
  ticketIds: readonly string[],
): Promise<AdjuntosGuardados> {
  const porTicket = new Map<string, AdjuntoDeLicitacion[]>();
  if (ticketIds.length === 0) return { porTicket, esquemaAtrasado: false };
  try {
    /* Sin `texto`: son hasta 50.000 caracteres por archivo y la pantalla no los muestra. Traer
       33 carteles enteros para pintar una lista de nombres es medio megabyte al pedo en cada
       carga. El texto lo pide aparte quien lo va a usar (el armador del prompt). */
    const filas = await prisma.sicopAdjunto.findMany({
      where: { hubspotTicketId: { in: [...ticketIds] } },
      select: SIN_TEXTO,
      orderBy: [{ hubspotNoteId: "asc" }, { createdAt: "asc" }],
    });
    for (const f of filas) {
      const lista = porTicket.get(f.hubspotTicketId) ?? [];
      lista.push({ ...f, extraidoEl: f.extraidoEl?.toISOString() ?? null });
      porTicket.set(f.hubspotTicketId, lista);
    }
    return { porTicket, esquemaAtrasado: false };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { porTicket, esquemaAtrasado: true };
    throw e;
  }
}

/** El texto ya extraído de un ticket, para armar el prompt. Solo lo que aportó algo. */
export async function leerTextoDeAdjuntos(ticketId: string): Promise<AdjuntoConTexto[]> {
  try {
    const filas = await prisma.sicopAdjunto.findMany({
      where: { hubspotTicketId: ticketId, estado: "EXTRAIDO", NOT: { texto: null } },
      orderBy: { createdAt: "asc" },
    });
    return filas.map((f) => ({
      ...f,
      extraidoEl: f.extraidoEl?.toISOString() ?? null,
    }));
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

// ── HubSpot Files ──────────────────────────────────────────────────────────────

interface MetadatosDeArchivo {
  nombre: string | null;
  extension: string | null;
  mimeType: string | null;
  tamanoBytes: number | null;
  url: string | null;
}

/** Devuelve `403` como estado, no como excepción: falta el scope, no está roto nada. */
async function metadatos(
  hs: HsClient,
  fileId: string,
): Promise<{ status: number; meta: MetadatosDeArchivo | null }> {
  const res = await hs.apiRequest({ method: "GET", path: `/files/v3/files/${fileId}` });
  if (res.status !== 200) return { status: res.status, meta: null };
  const d = (await res.json()) as {
    name?: string | null;
    extension?: string | null;
    type?: string | null;
    size?: number | null;
    url?: string | null;
    defaultHostingUrl?: string | null;
  };
  return {
    status: 200,
    meta: {
      nombre: d.name ?? null,
      extension: d.extension ?? null,
      // `type` de HubSpot es la familia ("DOCUMENT", "IMG"), no el mimeType. El bueno se
      // deriva de la extensión — ver `mimeDeExtension`.
      mimeType: mimeDeExtension(d.extension ?? null),
      tamanoBytes: typeof d.size === "number" ? d.size : null,
      // ⚠ La URL sale de la API, nunca se arma a mano.
      url: d.url ?? d.defaultHostingUrl ?? null,
    },
  };
}

/**
 * ⚠ Los adjuntos de una nota son PRIVADOS: su `url` pública devuelve 403 al descargarla. La
 * única que sirve es la firmada, que además caduca — por eso se pide justo antes de bajar y
 * no se guarda.
 */
async function urlFirmada(hs: HsClient, fileId: string): Promise<{ status: number; url: string | null }> {
  const res = await hs.apiRequest({ method: "GET", path: `/files/v3/files/${fileId}/signed-url` });
  if (res.status !== 200) return { status: res.status, url: null };
  const d = (await res.json()) as { url?: string };
  return { status: 200, url: d.url ?? null };
}

/**
 * MimeType a partir de la extensión: es lo que `extractText` usa para elegir el parser.
 * HubSpot devuelve la extensión pero no el mimeType, así que la traducción vive acá y no
 * dentro del extractor, que es compartido con proyectos y Drive.
 */
export function mimeDeExtension(ext: string | null | undefined): string | null {
  const e = (ext ?? "").toLowerCase().replace(/^\./, "");
  const mapa: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    txt: "text/plain",
    csv: "text/csv",
  };
  return mapa[e] ?? null;
}

// ── La extracción ──────────────────────────────────────────────────────────────

export interface ResultadoDeExtraccion {
  estado: SicopAdjuntoEstado;
  caracteres: number;
  error: string | null;
}

/**
 * Baja UN archivo y le saca el texto. Nunca tira: cada final posible es un estado con nombre.
 *
 * El estado NO es cosmético — es lo que separa «hay que autorizar el scope», «hay que pasarle
 * OCR» y «esto se rompió», tres problemas con tres dueños distintos.
 */
export async function extraerAdjunto(
  hs: HsClient,
  adjunto: { id: string; hubspotFileId: string },
): Promise<ResultadoDeExtraccion> {
  const fallar = async (
    estado: SicopAdjuntoEstado,
    error: string | null,
    extra: Record<string, unknown> = {},
  ): Promise<ResultadoDeExtraccion> => {
    await prisma.sicopAdjunto.update({
      where: { id: adjunto.id },
      data: { estado, error, intentadoEl: new Date(), ...extra },
    });
    return { estado, caracteres: 0, error };
  };

  try {
    const { status, meta } = await metadatos(hs, adjunto.hubspotFileId);
    if (status === 403) {
      return await fallar(
        "SIN_PERMISO",
        "Falta el scope `files` en la app de HubSpot (403 MISSING_SCOPES).",
      );
    }
    if (status !== 200 || !meta) {
      return await fallar("ERROR", `HubSpot devolvió ${status} al leer el archivo`);
    }

    const datosDelArchivo = {
      nombre: meta.nombre,
      extension: meta.extension,
      mimeType: meta.mimeType,
      tamanoBytes: meta.tamanoBytes,
      urlHubspot: meta.url,
    };

    if (meta.tamanoBytes != null && meta.tamanoBytes > MAX_BYTES_ADJUNTO) {
      return await fallar(
        "DEMASIADO_GRANDE",
        `Pesa ${Math.round(meta.tamanoBytes / 1024 / 1024)} MB; el tope es ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB.`,
        datosDelArchivo,
      );
    }
    if (!meta.mimeType) {
      return await fallar(
        "SIN_TEXTO",
        `No se sabe leer un archivo .${meta.extension ?? "?"}`,
        datosDelArchivo,
      );
    }

    const firmada = await urlFirmada(hs, adjunto.hubspotFileId);
    if (firmada.status === 403) {
      return await fallar("SIN_PERMISO", "Falta el scope `files` en la app de HubSpot.", datosDelArchivo);
    }
    if (!firmada.url) {
      return await fallar("ERROR", `No se pudo firmar la descarga (${firmada.status})`, datosDelArchivo);
    }

    const bin = await fetch(firmada.url);
    if (!bin.ok) return await fallar("ERROR", `La descarga devolvió ${bin.status}`, datosDelArchivo);
    const buffer = Buffer.from(await bin.arrayBuffer());
    if (buffer.length > MAX_BYTES_ADJUNTO) {
      return await fallar("DEMASIADO_GRANDE", `Bajó ${buffer.length} bytes`, datosDelArchivo);
    }

    const texto = await extractText(buffer, meta.mimeType);

    if (!texto) {
      /* Ni error ni éxito: un cartel escaneado. El motivo va escrito para que quien lo lea
         sepa que la respuesta es OCR y no un reintento. */
      return await fallar(
        "SIN_TEXTO",
        "El archivo no dio texto (probablemente un PDF escaneado; haría falta OCR).",
        datosDelArchivo,
      );
    }

    await prisma.sicopAdjunto.update({
      where: { id: adjunto.id },
      data: {
        ...datosDelArchivo,
        estado: "EXTRAIDO",
        texto,
        caracteres: texto.length,
        error: null,
        intentadoEl: new Date(),
        extraidoEl: new Date(),
      },
    });
    return { estado: "EXTRAIDO", caracteres: texto.length, error: null };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Falló la descarga";
    try {
      return await fallar("ERROR", motivo);
    } catch {
      /* Si ni siquiera se pudo anotar el fallo (tabla ausente), se reporta y la corrida sigue. */
      return { estado: "ERROR", caracteres: 0, error: motivo };
    }
  }
}

/** Los archivos de un ticket que todavía no dieron texto y vale la pena intentar. */
export async function adjuntosPorLeer(
  ticketIds: readonly string[],
  reintentarFallidos = false,
): Promise<{ id: string; hubspotFileId: string; hubspotTicketId: string }[]> {
  /* ⛔ SIN_TEXTO y DEMASIADO_GRANDE NO se reintentan ni forzando: el resultado sería idéntico
     y solo gasta llamadas. Lo que cambia con el permiso o con el tiempo es SIN_PERMISO y
     ERROR — esos sí. */
  const estados: SicopAdjuntoEstado[] = reintentarFallidos
    ? ["PENDIENTE", "SIN_PERMISO", "ERROR"]
    : ["PENDIENTE", "SIN_PERMISO"];
  try {
    return await prisma.sicopAdjunto.findMany({
      where: { hubspotTicketId: { in: [...ticketIds] }, estado: { in: estados } },
      select: { id: true, hubspotFileId: true, hubspotTicketId: true },
      orderBy: { createdAt: "asc" },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}
