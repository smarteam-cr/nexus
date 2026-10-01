/**
 * lib/exploraciones/documentos.ts — las sesiones y los documentos que el vendedor suma a mano. SERVIDOR.
 *
 * Pedido de Elías (2026-10-01): no toda reunión queda grabada en Meet ni en HubSpot. El vendedor
 * pega el texto o sube un archivo (el resumen del Smartflow, una minuta) y el agente lo lee igual que
 * una transcripción, con las mismas reglas: propone, con la frase literal que lo respalda, y el
 * vendedor usa o descarta. Se guarda solo el TEXTO, nunca el archivo.
 *
 * Sin la tabla (el SQL todavía no corrió), todo responde vacío o 503: el lienzo abre igual.
 */
import "server-only";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";

export const SQL_DE_DOCUMENTOS = "scripts/sql/2026-10-01-exploracion-documentos.sql";

/** Cuánto texto se guarda de un documento: lo mismo que el agente lee de una transcripción. */
export const MAX_TEXTO_DEL_DOCUMENTO = 60_000;
/** Cuántos documentos admite una exploración: más que eso ya no es una exploración. */
export const MAX_DOCUMENTOS = 30;

export const ORIGENES_DEL_DOCUMENTO = ["pegado", "archivo"] as const;
export type OrigenDelDocumento = (typeof ORIGENES_DEL_DOCUMENTO)[number];

/** Lo que ve la pantalla de un documento: sin el texto, que puede ser largo. */
export interface DocumentoDeLaLista {
  id: string;
  titulo: string;
  origen: OrigenDelDocumento;
  nombreArchivo: string | null;
  fecha: string | null;
  caracteres: number;
  creadoPor: string;
  creadoEn: string;
}

export const documentosDisponibles = () => modeloDisponible(prisma.exploracionDocumento);

export async function listarDocumentos(exploracionId: string): Promise<DocumentoDeLaLista[]> {
  if (!documentosDisponibles()) return [];
  const filas = await prisma.$queryRaw<{ id: string; titulo: string; origen: string; nombreArchivo: string | null; fecha: string | null; caracteres: number; creadoPor: string; createdAt: Date }[]>`
    SELECT "id", "titulo", "origen", "nombreArchivo", "fecha", char_length("texto")::int AS "caracteres", "creadoPor", "createdAt"
    FROM "ExploracionDocumento"
    WHERE "exploracionId" = ${exploracionId}
    ORDER BY "createdAt" DESC
    LIMIT ${MAX_DOCUMENTOS}`;
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    origen: f.origen === "archivo" ? "archivo" : "pegado",
    nombreArchivo: f.nombreArchivo,
    fecha: f.fecha,
    caracteres: f.caracteres,
    creadoPor: f.creadoPor,
    creadoEn: f.createdAt.toISOString(),
  }));
}

export type ResultadoDelDocumento = { ok: true; id: string } | { ok: false; status: number; error: string };

export async function crearDocumento(o: {
  exploracionId: string;
  titulo: string;
  origen: OrigenDelDocumento;
  nombreArchivo?: string | null;
  fecha?: string | null;
  texto: string;
  creadoPor: string;
}): Promise<ResultadoDelDocumento> {
  if (!documentosDisponibles()) return { ok: false, status: 503, error: `Falta aplicar ${SQL_DE_DOCUMENTOS} y reiniciar.` };
  const cuantos = await prisma.exploracionDocumento.count({ where: { exploracionId: o.exploracionId } });
  if (cuantos >= MAX_DOCUMENTOS) return { ok: false, status: 409, error: `Esta exploración ya tiene ${MAX_DOCUMENTOS} documentos: quita alguno antes de sumar otro.` };
  const creado = await prisma.exploracionDocumento.create({
    data: {
      exploracionId: o.exploracionId,
      titulo: o.titulo,
      origen: o.origen,
      nombreArchivo: o.nombreArchivo ?? null,
      fecha: o.fecha ?? null,
      texto: o.texto.slice(0, MAX_TEXTO_DEL_DOCUMENTO),
      creadoPor: o.creadoPor,
    },
    select: { id: true },
  });
  return { ok: true, id: creado.id };
}

/** Quita un documento. Lo que el agente ya propuso con él queda: lo decide el vendedor. */
export async function borrarDocumento(exploracionId: string, documentoId: string): Promise<boolean> {
  if (!documentosDisponibles()) return false;
  const r = await prisma.exploracionDocumento.deleteMany({ where: { id: documentoId, exploracionId } });
  return r.count > 0;
}

/** Los documentos con su texto, para el agente: los que todavía no leyó (o el que se pidió), más nuevos primero. */
export async function documentosParaLeer(
  exploracionId: string,
  o: { soloEste?: string | null; excepto?: readonly string[]; cuantos: number },
): Promise<{ id: string; titulo: string; fecha: string | null; texto: string; createdAt: Date }[]> {
  if (!documentosDisponibles()) return [];
  return prisma.exploracionDocumento.findMany({
    where: {
      exploracionId,
      ...(o.soloEste ? { id: o.soloEste } : o.excepto?.length ? { id: { notIn: [...o.excepto] } } : {}),
    },
    select: { id: true, titulo: true, fecha: true, texto: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: o.cuantos,
  });
}
