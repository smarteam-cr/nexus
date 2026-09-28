/**
 * lib/escala/documento/vigente.ts — la escala que está publicada en Nexus. SERVIDOR.
 *
 * Nexus es la fuente: la versión vigente es la última publicada en "EscalaDocumento" (la sube
 * `scripts/publicar-escala.ts`, que la valida antes). Acá se lee y se parsea UNA vez por versión:
 * cada llamada pregunta solo la huella de la última (una fila, sin el texto), y el texto se baja
 * y se parsea cuando la huella cambia.
 *
 * Si la última publicada no se entiende con ESTE código (se publicó con un lector más nuevo y
 * todavía no se deployó), se muestra la anterior que sí se entiende, con un aviso: la sección no
 * se cae por una publicación adelantada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import type { DocumentoDeLaEscala } from "./documentos";
import { parsearEscala } from "./parsear";
import { ErrorDeFormato, type Escala } from "./tipos";

export type EscalaVigente =
  | {
      estado: "ok";
      escala: Escala;
      huella: string;
      publicadaEn: Date;
      /** La última publicada no se pudo leer con este código: se muestra la anterior. */
      aviso: string | null;
    }
  | { estado: "sin-publicar" }
  /** Falta aplicar el SQL (o reiniciar con el cliente de Prisma nuevo). */
  | { estado: "sin-tablas" };

export const SQL_DE_LA_ESCALA = "scripts/sql/2026-09-27-escala-lector-y-comentarios.sql";

/** Una versión ya parseada por huella. Son pocas y no cambian: no hace falta desalojar. */
const parseadas = new Map<string, Escala | ErrorDeFormato>();

function parsearConCache(huella: string, texto: string): Escala | ErrorDeFormato {
  const previa = parseadas.get(huella);
  if (previa) return previa;
  let r: Escala | ErrorDeFormato;
  try {
    r = parsearEscala(texto);
  } catch (e) {
    r = e instanceof ErrorDeFormato ? e : new ErrorDeFormato(e instanceof Error ? e.message : String(e));
  }
  parseadas.set(huella, r);
  return r;
}

export async function leerEscalaVigente(): Promise<EscalaVigente> {
  if (!modeloDisponible(prisma.escalaDocumento)) return { estado: "sin-tablas" };
  try {
    const publicadas = await prisma.escalaDocumento.findMany({
      where: { documento: "escala" },
      orderBy: { publicadaEn: "desc" },
      select: { id: true, version: true, huella: true, publicadaEn: true },
      take: 5,
    });
    if (publicadas.length === 0) return { estado: "sin-publicar" };

    let aviso: string | null = null;
    for (const p of publicadas) {
      let resultado = parseadas.get(p.huella);
      if (!resultado) {
        const fila = await prisma.escalaDocumento.findUnique({ where: { id: p.id }, select: { texto: true } });
        if (!fila) continue;
        resultado = parsearConCache(p.huella, fila.texto);
      }
      if (resultado instanceof ErrorDeFormato) {
        console.error(`[escala] la versión publicada ${p.version} no se puede leer con este código:`, resultado.message);
        aviso ??= `La versión ${p.version} está publicada, pero esta versión de Nexus no la sabe leer (${resultado.message}). Se muestra la anterior hasta el próximo deploy.`;
        continue;
      }
      return { estado: "ok", escala: resultado, huella: p.huella, publicadaEn: p.publicadaEn, aviso };
    }
    return { estado: "sin-publicar" };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tablas" };
    throw e;
  }
}

/** El texto publicado de un documento (la última versión, o la pedida), para descargarlo. */
export async function leerDocumentoPublicado(
  documento: DocumentoDeLaEscala,
  version?: string | null,
): Promise<{ archivo: string; version: string; texto: string } | null> {
  if (!modeloDisponible(prisma.escalaDocumento)) return null;
  try {
    return await prisma.escalaDocumento.findFirst({
      where: { documento, ...(version ? { version } : {}) },
      orderBy: { publicadaEn: "desc" },
      select: { archivo: true, version: true, texto: true },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

/** Qué versiones hay publicadas de cada documento (para el menú de descarga). */
export async function versionesPublicadas(): Promise<
  { documento: string; version: string; escalaVersion: string; publicadaEn: Date }[]
> {
  if (!modeloDisponible(prisma.escalaDocumento)) return [];
  try {
    return await prisma.escalaDocumento.findMany({
      orderBy: { publicadaEn: "desc" },
      select: { documento: true, version: true, escalaVersion: true, publicadaEn: true },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}
